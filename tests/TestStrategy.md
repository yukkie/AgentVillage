# AgentVillage Test Strategy

本ドキュメントは、テスト設計の原則・テストレベルの定義・規約を定める。

---

## 1. SUT-first テスト設計原則

テストを書く前に **SUT（System Under Test）** — つまり「何をテストするか」を先に定義する。

### 原則

1. **SUTを先に宣言する** — テストファイル冒頭のdocstringにSUTを明記してから書き始める
2. **MockはSUTを隔離するための手段** — Mockは「SUTの依存を取り除くため」に使う。Mockが多いほどテストの価値は下がる
3. **1テスト = 1つのSUT観点** — 複数のロジックを1つのテストで検証しない

### アンチパターン

| アンチパターン | 問題 |
|---|---|
| Mockを先に決めてからテストを書く | テスト対象が曖昧になり、実装詳細に密結合する |
| 定数パッチで副作用を迂回する | SUTの本来の振る舞いではなく副作用の回避をテストしている |
| Unit/Integrationの境界が曖昧 | テストが遅くなり、失敗原因の特定が難しくなる |

---

## 2. テストレベル定義

### Unit Test (`@pytest.mark.unit`)

- **対象**: 単一の関数・クラスの純粋なロジック
- **条件**: ファイルI/O・ネットワーク・外部プロセスに依存しない（`tmp_path` は可）
- **速度**: ミリ秒単位で完了すること

### Integration Test (`@pytest.mark.integration`)

- **対象**: 複数モジュールの連携、または実際のファイルI/Oを伴う動作
- **条件**: 実LLM API呼び出しは含まない（コストとFlakyリスクのため）
- **速度**: 秒単位まで許容

### E2E Test (`@pytest.mark.e2e`)

- **対象**: ゲーム開始から終了までの一連のフロー全体
- **条件**: 実LLM API呼び出しを含む場合がある。CI では原則スキップ（手動実行）
- **速度**: 分単位まで許容

マーカーを省略した場合は `unit` として扱う（CI設定に準じる）。

---

## 3. docstring 規約

各テスト関数には以下の4要素をdocstringで明示する:

```python
def test_load_events_skips_blank_lines(tmp_path: Path) -> None:
    """
    SUT: load_events()
    Mock: なし（tmp_path で実ファイルI/Oを使用）
    Level: unit
    Objective: 空行を含むJSONLファイルから、空行をスキップしてイベントを読み込めること。
    """
```

- **SUT**: テスト対象の関数・クラス・メソッド名
- **Mock**: 使用するMock/monkeypatchとその目的。なければ「なし」と明記
- **Level**: `unit` / `integration` / `e2e` のいずれか
- **Objective**: このテストが何を検証するかを1文で記述する

### クリーンアップ規約

既存テストを変更する場合は、変更対象のテスト関数のdocstringを本規約に沿って修正する。
新規追加のテストは最初から本規約に従うこと。

---

## 4. Mock 使用ポリシー

Mock は SUT を依存から隔離する手段だが、**自分のコード同士の境界**で乱用すると
モジュール間の契約がテストから消え、表面的な coverage と実効的な保証がズレる
(Issue #180)。以下の3分類で運用する。

### Required(モック必須)

外部依存・非決定要素・遅い処理。実物を使うとコスト/Flaky/再現性の問題が出る。

- LLM API (`anthropic.Anthropic.messages.create`)
- 時刻 (`datetime.now()`)・乱数 (`random.*`)
- ネットワーク I/O・サブプロセス起動

ただしモック応答は**実物と同じ JSON スキーマ**(`src/domain/schema.py`)に従うこと。
スキーマを外れたモック応答は契約破壊の元になる。

### Forbidden(モック禁止 = 実物を使う)

**自分のコード同士の間で受け渡される契約データ**。consumer 側のテストで
これらを「合成」して渡してはいけない。代わりに以下のいずれかを使う:

- 本物の producer に吐かせる(例: `GameEngine` に `LogEvent` を吐かせる)
- 共有 fixture (`make_test_actor`, `make_test_engine` 等)
- 契約テスト(`tests/contract/`)

対象は次のクラス/型(docstring に `Mock-Policy: Forbidden` マーカー付き):

| クラス/型 | ファイル | 契約の相手 |
|---|---|---|
| `LogEvent` | `src/domain/event.py` | Engine ↔ Renderer / Replay / LogWriter |
| `Actor`, `ActorState` | `src/domain/actor.py` | Engine ↔ store(JSON 永続化) |
| `AgentOutput`, `JudgmentOutput`, `PreNightOutput`, `WolfChatOutput` | `src/domain/schema.py` | LLM 応答 JSON 契約 |

### Conditional(その他)

上記いずれにも明記されない型はデフォルトで Conditional 扱い。
判断に迷ったら本節を参照し、必要なら境界判定基準(下記)で評価する。

### 境界判定基準

ある型を Forbidden 側に分類すべきか迷ったときの3条件:

1. **Producer と Consumer が分離している** — 別モジュール、永続化を挟む、プロセス境界を跨ぐ
2. **片方を変えたとき型システムが捕まえない** — `dict` ベース、`content: str` のような自由形式フィールドを含む
3. **壊れたときのブラスト半径が大きい** — セーブデータ、Replay ログ、LLM I/O スキーマ

### コード上のマーカー

主要な Forbidden / Required クラスの docstring に `Mock-Policy:` マーカーが
付いている。新しい境界型を追加するときも同じ形式で記入すること。

```python
class LogEvent(BaseModel):
    """...

    Mock-Policy: Forbidden
        Contract type between Engine (producer) and Renderer/Replay/LogWriter
        (consumers). Tests must use a real producer or contract fixtures.
    """
```

検索: `grep -rn "Mock-Policy:" src/`

### 契約テスト(`tests/contract/`)

Forbidden 型が絡む境界には契約テストを置く。モックではなく**本物の producer
が吐いた値を本物の consumer に渡して**、両側が同じ契約に従っていることを確認する。

例: `tests/contract/test_engine_renderer_contract.py` は
`GameEngine` に夜フェーズを走らせて吐かれた `LogEvent` を `Renderer` に
通し、`target` フィールドが renderer 出力に届くことを検証する。

---

## 5. 意図的未カバー領域

| 領域 | 理由 |
|---|---|
| 実LLM API呼び出し（Live Integration） | APIコスト・Flakyリスクを避けるため。`MagicMock` で代替 |
| LLM出力の品質・整合性検証 | Issue #45（promptfoo導入）で別途対応予定 |
| UIのターミナル描画（Visual Regression） | 保守コストが高いため目視確認に留める |
