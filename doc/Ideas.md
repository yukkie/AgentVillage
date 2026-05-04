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
| yukkie/AgentVillage#247 | bug | 🔴 | - | Fix: wolf intended_co not passed to discussion phase prompt (PR#242 regression) | DISCUSSIONフェーズのプロンプトに intended_co が渡されず、狼が翌日に偽CO作戦を実行できないデグレ |
| yukkie/AgentVillage#248 | enhancement | 🔴 | - | Feat: pass wolf CO reasoning to discussion phase prompt | 夜の偽CO決定時の reasoning を翌日 DISCUSSION フェーズのプロンプトに含め、狼の発言一貫性を高める |
| yukkie/AgentVillage#244 | bug | 🔴 | 1 | Fix silent result displays empty speech instead of watching message | SilentResult 選択時に watching メッセージではなく空発言行が表示されるバグを修正 |
| yukkie/AgentVillage#243 | enhancement | 🔴 | 3 | Add prompt cache control to reduce API cost and latency | 固定文字列比率を調査のうえ cache_control を付与しコスト・遅延を削減 |
| yukkie/AgentVillage#256 | tech-debt | 🟡 | 3 | Review and eliminate semantic clone code across phase modules | #245リファクタで発覚したOPENING/DISCUSSIONクローンをきっかけに、フェーズ間の意味的重複（プロンプトビルダー・後処理・並列呼び出しboilerplate）を棚卸しして整理 |
| yukkie/AgentVillage#252 | tech-debt | 🟡 | 1 | Add unit tests for uncovered paths in phase_day and game modules | #245リファクタ時のカバレッジ確認で判明した未テストパス（_game_over / vote target=None / _resolve_post_vote）を補完 |
| yukkie/AgentVillage#207 | tech-debt | 🔴 | 1 | Add 'Why' rationale to project-discipline.md for key development process decisions | 主要プロセス決定の Why を project-discipline.md に記載し SKILL.md から参照する |
| yukkie/AgentVillage#23 | enhancement | 🟡 | 3 | Auto-summarize memory_summary | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#227 | enhancement | 🟡 | 2 | Add early exit for wolf night chat consensus | 全狼の最新攻撃候補が一致したら夜会話を早期終了し、未合意時は既存ラウンド継続を維持する |
| yukkie/AgentVillage#26 | enhancement | 🟢 | 2 | Thought log display mode switching | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#79 | enhancement | 🟢 | 5 | Log analysis agent skill for post-game review | ゲームログをAgentに委譲して解析・サマリーを返すスキル |
| yukkie/AgentVillage#45 | enhancement | 🟢 | 5 | LLM output testing with promptfoo | speech/thought/intent の品質を CI で自動検証 |
| yukkie/AgentVillage#138 | enhancement | 🟢 | 2 | 複数LLM対応の設計検討 | 将来の複数LLMプロバイダー対応に向けた設計・ADRの検討 |
| yukkie/AgentVillage#25 | enhancement | 🟢 | 8 | Skill memory (cross-game learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#28 | enhancement | 🟢 | 8 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | enhancement | 🟢 | 8 | Persona community sharing | キャラテンプレートの共有 |
| yukkie/AgentVillage#27 | enhancement | 🟢 | 13 | Web / mobile app | FastAPI + WebSocket + React |
| yukkie/AgentVillage#30 | enhancement | 🟢 | 13 | State management DB migration | JSON → DB 移行 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
