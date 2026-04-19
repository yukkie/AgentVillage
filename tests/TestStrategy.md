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

## 4. モジュールごとのテストスコープ

### `src/agent/store.py`

- **SUT**: `load_all_from_dir()`, `load_all()`, `save()`
- **Unit Test**: `tests/unit/test_store.py`
  - `load_all_from_dir` が正常系・空ディレクトリを正しく処理すること
  - `load_all` が `load_all_from_dir(STATE_DIR)` に委譲していること
- **Mock**: `monkeypatch` で `STATE_DIR` を差し替え

### `src/logger/reader.py`

- **SUT**: `load_events()`
- **Unit Test**: `tests/unit/test_logger_reader.py`
  - 正常系・空ファイル・存在しないファイル・空行スキップ
- **Mock**: なし（`tmp_path` で実ファイルI/O）

### `src/logger/writer.py`

- **SUT**: `LogWriter.write()`
- **Unit Test**: 未実装（Issue #103 参照）
  - IOError 時にゲームがクラッシュしないこと

### `src/llm/prompt.py`

- **SUT**: `build_system_prompt()`, `build_pre_night_prompt()`, `build_judgment_prompt()` 等
- **Unit Test**: `tests/unit/test_prompt.py`, `tests/unit/test_judgment_prompt.py`, `tests/unit/test_pre_night.py`
  - 各種フラグ・ロール・フェーズに応じたプロンプト文字列の内容検証
- **Mock**: `Actor`, `GameEngine` を `MagicMock` で構築

### `src/llm/extract.py`

- **SUT**: JSONパース・スキーマバリデーション関数
- **Unit Test**: `tests/unit/test_extract_json.py`
- **Mock**: なし（純粋な文字列→オブジェクト変換）

### `src/domain/schema.py`

- **SUT**: Pydanticスキーマのバリデーション
- **Unit Test**: `tests/unit/test_judgment_schema.py`
- **Mock**: なし

### `src/agent/setup.py`

- **SUT**: `initialize_agents()`
- **Unit Test**: `tests/unit/test_setup.py`
- **Mock**: ファイルI/Oを `tmp_path` または `monkeypatch` で差し替え

### `src/engine/game.py` (`GameEngine`)

- **SUT**: 昼・夜・勝利判定フェーズの制御フロー
- **Unit Test**: `tests/unit/test_game_day_loop.py`, `tests/unit/test_pre_night.py`
  - LLM呼び出しを `MagicMock` で差し替えてフロー分岐を検証
- **Mock**: `LLMClient`, `LogWriter`, `store.save`

### `main.py`

- **SUT**: `main()` のCLI引数解釈とモジュール呼び出し順
- **Unit Test**: `tests/unit/test_main.py`
- **Mock**: `GameEngine`, `CLI`, `LogWriter`, `initialize_agents`, `archive_state`

---

## 5. 意図的未カバー領域

| 領域 | 理由 |
|---|---|
| 実LLM API呼び出し（Live Integration） | APIコスト・Flakyリスクを避けるため。`MagicMock` で代替 |
| LLM出力の品質・整合性検証 | Issue #45（promptfoo導入）で別途対応予定 |
| UIのターミナル描画（Visual Regression） | 保守コストが高いため目視確認に留める |
