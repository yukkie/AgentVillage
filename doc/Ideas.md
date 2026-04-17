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
| yukkie/AgentVillage#72 | tech-debt | 🔴 | 3 | Replace role name strings with Role type in Intent, ActorState.claimed_role, LogEvent | Intent.co / claimed_role / LogEvent.claimed_role を str から Role 型に変更 |
| yukkie/AgentVillage#61 | tech-debt | 🔴 | 3 | Move common prompt content to Role ABC default methods | prompt.py のコンテンツ文字列を Role ABC のデフォルトメソッドに移動し、prompt.py をアセンブルのみに |
| yukkie/AgentVillage#41 | tech-debt | 🔴 | 1 | Replace role string literals | タイポ時に実行時エラーにならない。#24 のRole化で定数に集約 |
| yukkie/AgentVillage#76 | tech-debt | 🟡 | 3 | Refactor renderer.py into Renderer class with GUI migration hint | Renderer クラス化・イベントスタイルを整理・GUI化時の EventPresenter 設計ヒントをコメントで残す |
| yukkie/AgentVillage#74 | tech-debt | 🟡 | 5 | Split ActorState into ActorProfile (static) and ActorState (dynamic) | name/role/model/persona を ActorProfile に分離。ActorState は動的フィールドのみ |
| yukkie/AgentVillage#81 | tech-debt | 🟡 | 5 | Separate night action declaration and resolution phases | 夜フェーズの宣言・実行・公表を3段階に分離。seer_survived フラグ削除。キツネ等の複雑な相互作用に対応 |
| yukkie/AgentVillage#58 | tech-debt | 🟡 | 8 | Split GameEngine phases into dedicated modules | game.py を前夜・昼・夜フェーズモジュールに分割 |
| yukkie/AgentVillage#33 | enhancement | 🟢 | 5 | Wolf chat improvements | 早期終了・偽CO協議・テスト |
| yukkie/AgentVillage#36 | enhancement | 🟢 | 5 | Belief updates from agent reasoning | suspicion/trust を推理結果から更新 |
| yukkie/AgentVillage#47 | enhancement | 🟢 | 3 | Reasoning field for Vote/Guard/Divination/Judgment | 各アクションに reasoning を追加し spectator ログ・memory_update に記録 |
| yukkie/AgentVillage#23 | enhancement | 🟢 | 3 | Auto-summarize memory_summary | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#45 | enhancement | 🟢 | 5 | LLM output testing with promptfoo | speech/thought/intent の品質を CI で自動検証 |
| yukkie/AgentVillage#26 | enhancement | 🟢 | 2 | Thought log display mode switching | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#21 | enhancement | 🟢 | 5 | Day 2+ pre-night judgment phase | 昼開始前の判断フェーズを Day 2+ にも拡張 |
| yukkie/AgentVillage#25 | enhancement | 🟢 | 8 | Skill memory (cross-game learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#28 | enhancement | 🟢 | 8 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | enhancement | 🟢 | 8 | Persona community sharing | キャラテンプレートの共有 |
| yukkie/AgentVillage#27 | enhancement | 🟢 | 13 | Web / mobile app | FastAPI + WebSocket + React |
| yukkie/AgentVillage#30 | enhancement | 🟢 | 13 | State management DB migration | JSON → DB 移行 |
| yukkie/AgentVillage#79 | enhancement | 🟢 | - | Log analysis agent skill for post-game review | ゲームログをAgentに委譲して解析・サマリーを返すスキル |
| yukkie/AgentVillage#84 | enhancement | 🟢 | - | Parallelize LLM requests in day speech phase | 発言順確定後にThreadPoolExecutorで並列リクエスト発行しゲームを高速化 |
| yukkie/AgentVillage#86 | enhancement | 🟢 | - | Parallelize judgment+speech chain in day discussion phase | DISCUSSIONで判断+発言をアクターごとにチェーンし並列実行 |
| yukkie/AgentVillage#88 | enhancement | 🟢 | - | Merge judgment and speech into single LLM call using tool use | tool useで発言+アクション構造化を1ステップ化。OPENING/DISCUSSION設計を統一 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
