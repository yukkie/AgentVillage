# AgentVillage 開発タスク一覧

## フェーズ 1: 昼フェーズ会話ループ（判断ターン実装）

### スキーマ・プロンプト
- [ ] `src/llm/schema.py` — `JudgmentOutput` モデル追加（`decision: Literal["challenge","speak","silent"]`, `reply_to: int | None`）
- [ ] `src/llm/schema.py` — `SpeechEntry` モデル追加（`speech_id: int`, `agent: str`, `text: str`）
- [ ] `src/llm/prompt.py` — `build_judgment_prompt()` 追加（軽量：role, persona, memory_summary, 直近発言リスト）
- [ ] `src/llm/prompt.py` — `build_speech_prompt()` に `reply_to_speech` 引数追加（challenge 時に参照発言を埋め込む）

### LLM クライアント
- [ ] `src/llm/client.py` — `call_judgment()` 追加（単体呼び出し）
- [ ] `src/llm/client.py` — `call_judgment_parallel()` 追加（ThreadPoolExecutor + as_completed で並列実行、レスポンス順でイテレート）

### ゲームエンジン
- [ ] `src/engine/phase.py` — `DAY_OPENING` / `DAY_DISCUSSION` フェーズ追加（既存 `DAY_SPEAK` / `DAY_REASON` を置き換え）
- [ ] `src/engine/game.py` — `_run_day()` をリファクタ
  - OPENING: 全員1回発言、speech_id カウンタ開始
  - DISCUSSION × 2: 判断並列 → レスポンス順に発言生成 → today_log 追記
  - 全員 silent のフォールバック処理
  - VOTE: 既存ロジック流用

### ロガー
- [ ] `src/logger/event.py` — `LogEvent` に `speech_id: int | None` / `reply_to: int | None` フィールド追加

## フェーズ 2: テスト

- [ ] `tests/unit/test_judgment_schema.py` — `JudgmentOutput` のバリデーション単体テスト
- [ ] `tests/unit/test_judgment_prompt.py` — `build_judgment_prompt()` の出力検証
- [ ] `tests/unit/test_game_day_loop.py` — `_run_day()` のフェーズ順・speech_id採番・フォールバック検証（LLM呼び出しはモック）

## 未着手・検討中

- [x] 前日以前の投票結果（誰が誰に投票したか）をプロンプトのPublic情報として渡す（現状は当日の発言ログのみ）

- [ ] Extended thinking フラグ（`call()` に `extended_thinking: bool = False` 引数）
- [ ] prompt cache 活用（キャラ性格mdファイルをシステムプロンプト先頭に固定して cache_control を付与）
- [ ] 思考ログのデバッグ表示と観戦表示の切り替えUI
