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

contract テストでは `Level: contract` を使い、さらに `Architecture ref:` を追加して
どのコンポーネント間契約を検証しているかを明記する。

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
| `AgentOutput`, `WolfChatOutput` | `src/domain/schema.py` | LLM 応答 JSON 契約 |
| `SpeakResult`, `ChallengeResult`, `CoResult`, `SilentResult` | `src/domain/schema.py` | DISCUSSION tool use 結果契約 |

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

外部ライブラリを直接ラップしている箇所には `External-Boundary:` マーカーを付与する。
バージョンアップ時の影響範囲を `grep "External-Boundary:"` で即座に把握できる。

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

## 5. テスト削除・移動のルール

### 削除してよい条件

テストを削除してよいのは、以下のいずれかを満たす場合のみ:

1. **SUT 自体が削除された** — テスト対象の関数・クラス・フェーズが実装から完全に消えた
2. **同等の検証が別テストで担保されている** — 削除前に「どのテストが代替するか」を PR 本文に明記する
3. **Legacy Adapter の退役** — §6 の退役判断に従う

### 削除してはいけないケース

- リファクタリングでシグネチャが変わった → テストを更新する
- テストが壊れた → 原因を調査して修正する
- 似たようなテストが既にある気がする → 重複を確認してから判断する

### contract テストの移動ルール

`tests/unit/` のテストを見直す際、以下の条件を満たすテストは `tests/contract/` へ移動する:

- 複数のコンポーネントをまたぐ振る舞いを検証している
- Forbidden 型のライフサイクルやデータフローを検証している
- `_run_day()` / `_run_night()` / `_run_wolf_chat()` のような engine 全体のオーケストレーションを検証している

### Architecture.md とのトレーサビリティ

contract テストは `doc/Architecture.md` のコンポーネント間データフロー記述を検証する唯一の手段と位置づける。

- `doc/Architecture.md` 側: 契約を記述するセクションに `Contract test:` を明記する
- contract テスト側: docstring に `Architecture ref: doc/Architecture.md §X.X` を明記する
- Architecture.md にデータフローを追記したら、対応する contract テストをセットで追加する

### PR レビューチェックリスト

テストを削除・移動する PR では、以下を本文に記載して確認する:

- [ ] 削除条件を満たすか明記している
- [ ] 削除する場合、代替テストを明記している
- [ ] contract 移動対象でないか確認している
- [ ] `Contract test:` 参照が宙ぶらりんになっていないか確認している

---

## 6. Legacy Adapter テストポリシー

`src/legacy/` は「本来なくてもよい互換コード」であり、壊れても型チェックや既存テストが
検知しにくい。このため以下のルールを適用する。

### カバレッジ要件

`src/legacy/` 配下の各関数・分岐は**すべて単体テストで網羅する**。
- 正常系: 現行フォーマットは変換なしにスルーされること
- 旧形式の各バリエーション: それぞれ独立したテストケースを用意すること
- 異常系・境界値: 不明な値・欠損フィールドがあってもクラッシュしないこと

### テスト配置

`tests/unit/legacy/` に配置する。ファイル名は `test_{モジュール名}.py`。

### 退役判断

互換対象フォーマットが完全に消滅した（古いアーカイブが存在しなくなった）と
判断したタイミングで `src/legacy/` のモジュールごとテストごと削除する。
削除前に `grep "Legacy-Adapter:"` で参照元がないことを確認すること。

---

## 7. カバーできない Missing への対応フロー

カバレッジ突合せで Missing 行が残ったとき、**即「カバー不可」と判断してはならない**。
まず以下の3分類チェックを行い、分類に応じた対応を取る。

### 3分類チェック

#### A. 内部不変条件（到達不能ガード節）

自分のコードが正しければ到達しないパス。型システムや呼び出し側が到達不能を保証している。

**典型パターン**:
```python
if role not in known_roles:  # Role は Enum で管理されており、到達しない
    return SilentResult(...)
```

**対応**: コードを削除するか `raise ValueError` / `assert False` に置き換える。
テストが書けないなら存在意義がない。削除によってカバレッジ問題ごと解消する。

> **原則**: 実運用上到達しないコードを発見した場合、カバレッジ対象外として扱ってはならない。
> まずそのコードが不要である可能性を検討し、削除・設計変更・明示的例外化のいずれかを提案すること。

#### B. 外部境界フォールバック

LLM・ユーザー入力など非決定的な外部入力に対する防衛コード。削除すべきではない。

**典型パターン**:
```python
if tool_name not in known_tools:  # LLM が未知のツール名を返した場合
    return SilentResult(...)
```

**対応**: テストを書く（書ける・書くべき）。
`MagicMock` で LLM 応答を偽装し、未知ツール名を返すケースを unit test で検証する。
「外部境界だからテスト不可」は誤り — このパスは再現可能。

#### C. テスト不可パス（§8 記載が適切なケース）

再現コストが極めて高い、または自動化が本質的に困難なパス。

**典型パターン**: 実 LLM API 呼び出し、OS 依存の例外パス、Visual Regression

**対応**: §8「意図的未カバー領域」に類例があるか確認し、該当すればカバー不可として承認を求める。

### 判断フロー

```
Missing 行を発見
    ↓
このコードは実運用で到達するか？
    ├─ No（到達不能）→ A: 削除 / raise に置き換え → カバレッジ問題ごと解消
    └─ Yes（到達しうる）
         ↓
    外部入力（LLM・ユーザー）によって引き起こされるか？
         ├─ Yes → B: テストを追加して解消
         └─ No（再現コストが極めて高い）→ C: §8 に類例があれば承認を求める
```

---

## 8. 意図的未カバー領域

| 領域 | 理由 |
|---|---|
| 実LLM API呼び出し（Live Integration） | APIコスト・Flakyリスクを避けるため。`MagicMock` で代替 |
| LLM出力の品質・整合性検証 | Issue #45（promptfoo導入）で別途対応予定 |
| UIのターミナル描画（Visual Regression） | 保守コストが高いため目視確認に留める |

---

## 9. Frontend Testing（`frontend/`）

`frontend/` 配下の JS/JSX コードについても §1〜§8 の原則を適用する。
言語・ツールが異なるだけで、**SUT-first・Mockポリシー・カバレッジ判断フロー**は同じ。
本章では JS 固有の事情（採用ツール・段階導入方針・ファイル配置）を補足する。

### 9.1 段階導入方針

Web UI は段階的に複雑化するため、テスト基盤も段階的に導入する。
**先回りでテスト基盤を整えると、スタブから実データへの差し替えで陳腐化する**ため避ける。

| Sprint | 範囲 | 導入するテスト |
|---|---|---|
| Milestone 1（#308〜#311） | スタブデータの描画 | **なし**（AC をスクショで確認） |
| Milestone 2（#312/#318/#319/#314） | 実データ接続・ロジック追加 | **Vitest によるユニットテスト**（純粋関数のみ） |
| #315 以降（FastAPI 化） | WebSocket・状態管理・認証 | **コンポーネントテスト + E2E**（React Testing Library + Playwright） |

#### 各段階で何をテストするか

**Milestone 1**: テスト不要。
- 大半が見た目・スタブ描画。コンポーネントテストを書いても「`<img>` の `src` 属性が正しい」程度しか検証できず、AC のスクショ確認の方が情報量が多い。
- スタブから実データに差し替えるとロジックが大きく変わり、Milestone 1 で書いたテストはすぐ陳腐化する。
- 例外: `Avatar` の「PNG が無いキャラはモノグラムにフォールバック」のような分岐ロジックがあれば、それだけは書いてよい。

**Milestone 2**: `parseGameData.js` のような **純粋関数のみ** ユニットテストを書く。
- 入出力が明確で陳腐化しにくい。
- 実ログ（`design/proposal/source_logs/` や `state_archive/{session}/`）をフィクスチャとして使う。

**#315 以降**: コンポーネント・E2E を本格導入する。
- WebSocket イベントの順序・再接続、認証フロー、マルチタブ動作などはテストなしでは品質保証できない。

### 9.2 採用ツール

| 種別 | ツール | 用途 |
|---|---|---|
| Unit / 純粋関数 | **Vitest** | Vite と統合された高速テストランナー。Jest 互換 API |
| コンポーネント | **React Testing Library**（#315 以降） | DOM 操作ベースでユーザー視点の動作を検証 |
| E2E | **Playwright**（#315 以降） | 実ブラウザでの操作シナリオ検証 |
| WebSocket Mock | **mock-socket** 等（#315 以降） | WS 接続のテスト |

### 9.3 ファイル配置

JS のテストは Python と同じ `tests/` 配下ではなく、**`frontend/` 内にコロケーション**する。

```text
frontend/
├── src/
│   ├── lib/
│   │   ├── parseGameData.js
│   │   └── parseGameData.test.js     # コロケーション
│   ├── components/
│   │   ├── Avatar.jsx
│   │   └── Avatar.test.jsx           # コロケーション（#315 以降）
│   └── ...
└── tests/                            # E2E（Playwright）はここ（#315 以降）
    └── e2e/
```

**理由**:
- Vitest は `*.test.js` をデフォルトで拾うため設定が単純
- ソースとテストが隣り合うことで参照しやすく、削除忘れも防げる
- E2E だけは `frontend/tests/e2e/` に分離（複数コンポーネントを跨ぐため）

### 9.4 docstring 規約（JS 版）

§3 の規約を JS の慣習（JSDoc）に合わせて適用する。

```js
/**
 * SUT: parseGameData()
 * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
 * Level: unit
 * Objective: JSONL 形式のログを { events, agents } の GameData 型に変換できること。
 */
test('parses spectator_log.jsonl into events array', () => {
  const result = parseGameData(fixtures.spectatorLog);
  expect(result.events).toHaveLength(42);
});
```

### 9.5 Mock 使用ポリシー（JS 版）

§4 の3分類（Required / Forbidden / Conditional）はそのまま JS にも適用する。

#### Required（モック必須）
- `fetch()` / WebSocket の外部呼び出し（実通信は Flaky）
- `Date.now()` / `Math.random()`（非決定要素）

#### Forbidden（モック禁止 = 実物を使う）

JS 側でも、**Python と JS の境界で受け渡される契約データ**は実物を使う。

| 型 | ファイル | 契約の相手 |
|---|---|---|
| `GameData` | `frontend/src/lib/parseGameData.js`（型定義） | Python LogWriter（producer）↔ React 画面（consumer） |
| `PublicEvent` | 同上 | 同上 |

これらは Python 側の `LogEvent`（`src/domain/event.py`、Mock-Policy: Forbidden）と 1:1 対応する境界型。
テストでは `design/proposal/source_logs/` や実ログを fixture として使い、合成しない。

#### Conditional
上記以外のオブジェクトはデフォルトで Conditional 扱い。

### 9.6 カバレッジ判断フロー（JS 版）

§7 の3分類チェック（A: 内部不変条件 / B: 外部境界フォールバック / C: テスト不可）はそのまま適用する。
カバレッジ計測は Vitest の `--coverage` オプションを使う（v8 / istanbul）。

### 9.7 ローカル品質ゲート

**Milestone 2 以降**:
- `frontend/package.json` に `"test": "vitest run"` スクリプトを追加
- `frontend/package.json` に `"test:coverage": "vitest run --coverage"` スクリプトを追加
- `.pre-commit-config.yaml` に JS テスト hook を追加（`npm test` + `npm run test:coverage`）
- Python の pytest hook と同じく、コミット前に frontend の回帰と coverage を確認する

GitHub Actions への frontend job 追加は必須にしない。ローカルの pre-commit gate で `npm test` と coverage がコマンド一発で実行できることを保証する。
