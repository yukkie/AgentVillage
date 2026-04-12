# AgentVillage — Ideas & Issue Tracker

アイデアの卵はここに書く。Claude が整理して適切なドキュメントまたは GitHub Issues に振り分ける。

プロジェクトコンセプト・ゲームスタイル → [README.md](../README.md)
ゲームルール・機能仕様 → [Spec.md](Spec.md)
アーキテクチャ・コンポーネント設計 → [Architecture.md](Architecture.md)
モジュール詳細設計 → [DetailDesign.md](DetailDesign.md)

---

## GitHub Issues（未実装タスク）

| # | タイトル | 内容 |
|---|---|---|
| yukkie/AgentVillage#21 | Day 2+ pre-night judgment phase | 昼開始前の判断フェーズを Day 2+ にも拡張 |
| ~~yukkie/AgentVillage#22~~ | ~~Night wolf chat + 7-player config~~ | ~~実装済みのためクローズ~~ |
| yukkie/AgentVillage#33 | Wolf chat improvements | 早期終了・偽CO協議・テスト |
| yukkie/AgentVillage#23 | Auto-summarize memory_summary | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#24 | Role class refactoring | Strategy パターンで役職クラス化 |
| yukkie/AgentVillage#25 | Skill memory (cross-game learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#26 | Thought log display mode switching | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#27 | Web / mobile app | FastAPI + WebSocket + React |
| yukkie/AgentVillage#28 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | Persona community sharing | キャラテンプレートの共有 |
| yukkie/AgentVillage#30 | State management DB migration | JSON → DB 移行 |
| yukkie/AgentVillage#36 | Belief updates from agent reasoning | suspicion/trust を推理結果から更新 |
| yukkie/AgentVillage#45 | LLM output testing with promptfoo | speech/thought/intent の品質を CI で自動検証 |

---

## GitHub Issues（技術的負債 `tech-debt`）

| # | 優先度 | タイトル |
|---|---|---|
| yukkie/AgentVillage#37 | 🟡 | `build_system_prompt` のパラメータ過多 |
| yukkie/AgentVillage#38 | 🟡 | `build_role_prompt` に guard がない |
| yukkie/AgentVillage#39 | 🟡 | `_load_agents()` が `store.load_all()` と重複 |
| yukkie/AgentVillage#40 | 🟢 | `_load_events()` の JSONL パースが重複しうる |
| yukkie/AgentVillage#41 | 🟢 | 役職名がすべて文字列リテラル |
| yukkie/AgentVillage#42 | 🟢 | CO 判断プロンプトの Werewolf / Madman ブロックが類似 |
| yukkie/AgentVillage#43 | 🟢 | replay.py のコメントが WHAT 説明になっている |

---

## 未整理メモ

*新しいアイデアはここに追記する*
