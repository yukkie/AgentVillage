# AgentVillage — Ideas & Issue Tracker

アイデアの卵はここに書く。Claude が整理して適切なドキュメントまたは GitHub Issues に振り分ける。

プロジェクトコンセプト・ゲームスタイル → [README.md](../README.md)
ゲームルール・機能仕様 → [Spec.md](Spec.md)
アーキテクチャ・コンポーネント設計 → [Architecture.md](Architecture.md)
モジュール詳細設計 → [DetailDesign.md](DetailDesign.md)

---

## GitHub Issues（未実装タスク）

| # | 種別 | 優先度 | タイトル | 内容 |
|---|---|---|---|---|
| yukkie/AgentVillage#61 | tech-debt | 🟢 | Move common prompt content to Role ABC default methods | prompt.py のコンテンツ文字列を Role ABC のデフォルトメソッドに移動し、prompt.py をアセンブルのみに |
| yukkie/AgentVillage#59 | tech-debt | 🟢 | Replace msvcrt with cross-platform key input | replay.py の Windows 専用 msvcrt をクロスプラットフォーム対応に置換 |
| yukkie/AgentVillage#58 | tech-debt | 🟢 | Split GameEngine phases into dedicated modules | game.py を前夜・昼・夜フェーズモジュールに分割 |
| yukkie/AgentVillage#57 | tech-debt | 🟢 | Move initialize_agents to src/engine/setup.py | main.py からゲーム初期化ロジックを engine 層に移動 |
| yukkie/AgentVillage#21 | enhancement | 🟡 | Day 2+ pre-night judgment phase | 昼開始前の判断フェーズを Day 2+ にも拡張 |
| yukkie/AgentVillage#41 | tech-debt | 🟢 | Replace role string literals | タイポ時に実行時エラーにならない。#24 のRole化で定数に集約 |
| yukkie/AgentVillage#42 | tech-debt | 🟢 | Merge similar CO prompt blocks | Werewolf/Madman の類似ブロックを統合。#24 の副産物として解消 |
| yukkie/AgentVillage#33 | enhancement | 🟢 | Wolf chat improvements | 早期終了・偽CO協議・テスト |
| yukkie/AgentVillage#36 | enhancement | 🟢 | Belief updates from agent reasoning | suspicion/trust を推理結果から更新 |
| yukkie/AgentVillage#47 | enhancement | 🟢 | Reasoning field for Vote/Guard/Divination/Judgment | 各アクションに reasoning を追加し spectator ログ・memory_update に記録 |
| yukkie/AgentVillage#23 | enhancement | 🟢 | Auto-summarize memory_summary | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#45 | enhancement | 🟢 | LLM output testing with promptfoo | speech/thought/intent の品質を CI で自動検証 |
| yukkie/AgentVillage#26 | enhancement | 🟢 | Thought log display mode switching | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#25 | enhancement | 🟢 | Skill memory (cross-game learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#28 | enhancement | 🟢 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | enhancement | 🟢 | Persona community sharing | キャラテンプレートの共有 |
| yukkie/AgentVillage#27 | enhancement | 🟢 | Web / mobile app | FastAPI + WebSocket + React |
| yukkie/AgentVillage#30 | enhancement | 🟢 | State management DB migration | JSON → DB 移行 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
