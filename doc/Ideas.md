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
| yukkie/AgentVillage#111 | tech-debt | 🔴 | 2 | PR #106: test_challenge_reply_to_recorded mock is not round-aware | モックがラウンド区別不可でアサーションが緩められた |
| yukkie/AgentVillage#93 | tech-debt | 🟡 | 3 | Module-level Anthropic client singleton makes testing difficult | _clientがモジュールロード時に生成されテスト時に差し替え不可 |
| yukkie/AgentVillage#97 | tech-debt | 🟡 | 3 | Move local imports to module top level in prompt.py and game.py | 関数内ローカルインポートがアーキテクチャ原則に違反 |
| yukkie/AgentVillage#101 | tech-debt | 🟡 | 3 | check_victory() only supports two-faction win conditions | 二項対立のみ。第三陣営・Madman単独勝利に対応不可 |
| yukkie/AgentVillage#103 | tech-debt | 🟡 | 1 | LogWriter.write() does not handle IOError — log failure crashes the game | ログ書き込み失敗でゲームが止まる |
| yukkie/AgentVillage#104 | tech-debt | 🟡 | 1 | load_events() fails entirely if any log line is corrupted | 1行でも壊れると全ログが読めなくなる |
| yukkie/AgentVillage#105 | tech-debt | 🟡 | 1 | ReplayPager crashes if archive agents/ dir is missing or has invalid JSON | アーカイブ破損時にリプレイ起動でクラッシュ |
| yukkie/AgentVillage#119 | tech-debt | 🟡 | 3 | Unify co-intent flags: rename force_co and type intended_co as Role \| None | force_coとintended_coの二重フラグを統合。Step1:force_co削除、Step2:bool→Role\|None型変更（2段階） |
| yukkie/AgentVillage#76 | tech-debt | 🟡 | 3 | Refactor renderer.py into Renderer class with GUI migration hint | Renderer クラス化・イベントスタイルを整理・GUI化時の EventPresenter 設計ヒントをコメントで残す |
| yukkie/AgentVillage#74 | tech-debt | 🟡 | 5 | Split ActorState into ActorProfile (static) and ActorState (dynamic) | name/role/model/persona を ActorProfile に分離。ActorState は動的フィールドのみ |
| yukkie/AgentVillage#81 | tech-debt | 🟡 | 5 | Separate night action declaration and resolution phases | 夜フェーズの宣言・実行・公表を3段階に分離。seer_survived フラグ削除。キツネ等の複雑な相互作用に対応 |
| yukkie/AgentVillage#58 | tech-debt | 🟡 | 8 | Split GameEngine phases into dedicated modules | game.py を前夜・昼・夜フェーズモジュールに分割 |
| yukkie/AgentVillage#94 | tech-debt | 🟢 | 1 | store.load() does not handle FileNotFoundError ⚠️unit test mandatory | ファイル不在時に未ハンドルの例外が伝播する |
| yukkie/AgentVillage#99 | tech-debt | 🟢 | 1 | setup.py silently ignores JSON parse errors in config files ⚠️unit test mandatory | config JSON破損時にトレースバックが素通りする |
| yukkie/AgentVillage#102 | tech-debt | 🟢 | 1 | memory.update_memory() silently propagates IOError from store.save() ⚠️unit test mandatory | IOError無言伝播。呼び出し元で対処不可 |
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
| yukkie/AgentVillage#138 | enhancement | 🟢 | - | 複数LLM対応の設計検討 | 将来の複数LLMプロバイダー対応に向けた設計・ADRの検討 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
