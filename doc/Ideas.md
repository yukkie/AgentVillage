# AgentVillage — Ideas & Issue Tracker

アイデアの卵はここに書く。Claude が整理して適切なドキュメントまたは GitHub Issues に振り分ける。

プロジェクトコンセプト・ゲームスタイル → [README.md](../README.md)
ゲームルール・機能仕様 → [Spec.md](Spec.md)
アーキテクチャ・コンポーネント設計 → [Architecture.md](Architecture.md)
モジュール詳細設計 → [DetailDesign.md](DetailDesign.md)

---

## GitHub Issues（未実装タスク）

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#184 | tech-debt | 🟡 | 3 | Add GameEngine tests for uncovered orchestration edge cases | `src/engine/game.py` の `run()` ループ、intended CO miss、memory update など未カバーの重要分岐を追加テストする |
| yukkie/AgentVillage#178 | tech-debt | 🔴 | 2 | Classify LLM fallback errors through a client helper | `client.py` の helper で LLM fallback のエラー種別を分類し、挙動を変えずに観測性を上げる（⚠️unit test mandatory） |
| yukkie/AgentVillage#177 | tech-debt | 🟢 | 5 | Centralize legacy compatibility normalization for logs and actor state | ログ・actor state の旧形式互換処理を 1 箇所に集約し、互換責務の分散を減らす |
| yukkie/AgentVillage#176 | bug | 🟢 | 2 | Fix replay log role rendering regression | INSPECT などのログで role object の repr が出るデグレを修正し、過去ログ互換を保ったまま人間向けの役職名を表示する |
| yukkie/AgentVillage#33 | enhancement | 🟢 | 5 | Wolf chat improvements | 早期終了・偽CO協議・テスト |
| yukkie/AgentVillage#36 | enhancement | 🟢 | 5 | Belief updates from agent reasoning | suspicion/trust を推理結果から更新 |
| yukkie/AgentVillage#47 | enhancement | 🟢 | 3 | Reasoning field for Vote/Guard/Divination/Judgment | 各アクションに reasoning を追加し spectator ログ・memory_update に記録 |
| yukkie/AgentVillage#23 | enhancement | 🟢 | 3 | Auto-summarize memory_summary | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#45 | enhancement | 🟢 | 5 | LLM output testing with promptfoo | speech/thought/intent の品質を CI で自動検証 |
| yukkie/AgentVillage#26 | enhancement | 🟢 | 2 | Thought log display mode switching | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#21 | enhancement | 🟢 | 5 | Day 2+ pre-night judgment phase | 昼開始前の判断フェーズを Day 2+ にも拡張 |
| yukkie/AgentVillage#79 | enhancement | 🟢 | 5 | Log analysis agent skill for post-game review | ゲームログをAgentに委譲して解析・サマリーを返すスキル |
| yukkie/AgentVillage#88 | enhancement | 🟢 | 5 | Merge judgment and speech into single LLM call using tool use | tool useで発言+アクション構造化を1ステップ化。OPENING/DISCUSSION設計を統一 |
| yukkie/AgentVillage#25 | enhancement | 🟢 | 8 | Skill memory (cross-game learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#28 | enhancement | 🟢 | 8 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | enhancement | 🟢 | 8 | Persona community sharing | キャラテンプレートの共有 |
| yukkie/AgentVillage#27 | enhancement | 🟢 | 13 | Web / mobile app | FastAPI + WebSocket + React |
| yukkie/AgentVillage#30 | enhancement | 🟢 | 13 | State management DB migration | JSON → DB 移行 |
| yukkie/AgentVillage#138 | enhancement | 🟢 | 2 | 複数LLM対応の設計検討 | 将来の複数LLMプロバイダー対応に向けた設計・ADRの検討 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
