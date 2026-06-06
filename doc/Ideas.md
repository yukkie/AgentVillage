# AgentVillage — Ideas & Issue Tracker

アイデアの卵はここに書く。Claude が整理して適切なドキュメントまたは GitHub Issues に振り分ける。

プロジェクトコンセプト・ゲームスタイル → [README.md](../README.md)
ゲームルール・機能仕様 → [Spec.md](Spec.md)
アーキテクチャ・コンポーネント設計 → [Architecture.md](Architecture.md)
モジュール詳細設計 → [DetailDesign.md](DetailDesign.md)

---

## GitHub Issues（未実装タスク）

並び順は Sprint Goal に沿って Milestone 2 優先 → ゲームロジック系 → 将来フェーズの順。
同一区分内では優先度（🔴 → 🟡 → 🟢）で並べる。


### Milestone 2（実データ観戦）— 現 Sprint

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#312 | enhancement | 🔴 | 3 | GameData registry | doc/GameData.md でデータギャップを継続管理（Milestone 横串モニター） |
| yukkie/AgentVillage#434 | bug | 🔴 | 2 | SpectatorScreen drops suspicion_update / threat_update (not displayed) | SpectatorScreen が suspicion_update / threat_update を SYSTEM_EVENT_VIEWS に持たず行ごと破棄。CLI renderer は [SUSPICION]/[THREAT] 表示可 |
| yukkie/AgentVillage#451 | bug | 🔴 | 3 | Persist accumulated suspicion/threat snapshots for replay | suspicion_update/threat_update イベントに accumulated snapshot を extra_data として付与し、リプレイ消費者が単一イベントから状態を復元できるようにする。#434 の前提 |
| yukkie/AgentVillage#352 | enhancement | 🟡 | 1 | Show prologue message on game start in SpectatorScreen feed | GAME START 時にプロローグ固定文をフォールバック表示。将来の role_assigned イベント実装時に差し替え |
| yukkie/AgentVillage#353 | enhancement | 🟡 | 1 | Emit role_assigned events at game start for each agent | init フェーズで全エージェント分の役職割り当てイベントを spectator_log に出力。#352 のフォールバック差し替え用 |
| yukkie/AgentVillage#347 | enhancement | 🟡 | 3 | Implement feed filters in SpectatorScreen left pane (agent / role / event type) | 参加者・役職・表示種別フィルターチップを実際に動作させる。追加データ不要でクライアントサイドのみで実装可能 |
| yukkie/AgentVillage#337 | enhancement | 🟡 | 2 | Top agents real stats | stub/gameList.js の TOP_AGENTS を実ゲーム結果の集計データに置き換え |
| yukkie/AgentVillage#319 | enhancement | 🟡 | 3 | LIVE spectator | state/ を tail して進行中ゲームを表示（Milestone 2 後半） |
| yukkie/AgentVillage#364 | enhancement | 🟡 | 5 | introduce SpectatorScreen view model indexes | SpectatorScreen 用 view model/index を導入し、render 中の events 全走査を減らす |
| yukkie/AgentVillage#321 | enhancement | 🟢 | 2 | Unify config data as shared JSON (SSOT) | config/*.json を Python/JS 共有にして constants.js のハードコードを廃止 |
| yukkie/AgentVillage#323 | enhancement | 🟢 | 3 | i18n support for frontend UI strings (ja/en) | JSX 内の日本語ハードコードを locale リソースに外出しし、ja/en 切り替えに対応 |
| yukkie/AgentVillage#342 | enhancement | 🟢 | 3 | Introduce React Router for game and agent detail navigation | React Router 導入。AgentDetailScreen 依存 |
| yukkie/AgentVillage#403 | enhancement | 🟢 | 2 | Add avatars to CO status and night action sections | CO状況・夜の行動セクションにアバターアイコンを追加しコンポーネント化 |
| yukkie/AgentVillage#379 | enhancement | 🟢 | 3 | Add static type checking to frontend JS (JSDoc or TypeScript) | フィールド名ミスをエディタ/CIで検出できるようにする。スタブ撤廃（#318）以降に検討 |

### ゲームロジック系（Web UI 軸とは別系統）

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#207 | tech-debt | 🔴 | 1 | Add 'Why' rationale to project-discipline.md for key development process decisions | 主要プロセス決定の Why を project-discipline.md に記載し SKILL.md から参照する |
| yukkie/AgentVillage#305 | bug | 🔴 | 1 | fix: include claimed_role in wolf prompts to prevent role-flip CO | claimed_role がプロンプトに渡されず、狼が自分の偽CO済み役職を忘れて別役職にCOしてしまう |
| yukkie/AgentVillage#248 | enhancement | 🟡 | 2 | Feat: pass wolf CO reasoning to discussion phase prompt | 夜の偽CO決定時の reasoning を翌日 DISCUSSION フェーズのプロンプトに含め、狼の発言一貫性を高める |
| yukkie/AgentVillage#266 | tech-debt | 🟡 | 5 | Replace intended_co flag with a typed scheduled-event model | intended_co をフラグから timing 付きスケジュール済みイベント型に置き換え、ライフサイクルを型で表現する |
| yukkie/AgentVillage#23 | enhancement | 🟡 | 3 | Auto-summarize memory_summary | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#227 | enhancement | 🟡 | 2 | Add early exit for wolf night chat consensus | 全狼の最新攻撃候補が一致したら夜会話を早期終了し、未合意時は既存ラウンド継続を維持する |
| yukkie/AgentVillage#26 | enhancement | 🟢 | 2 | Thought log display mode switching | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#79 | enhancement | 🟢 | 5 | Log analysis agent skill for post-game review | ゲームログをAgentに委譲して解析・サマリーを返すスキル |
| yukkie/AgentVillage#45 | enhancement | 🟢 | 5 | LLM output testing with promptfoo | speech/thought/intent の品質を CI で自動検証 |
| yukkie/AgentVillage#138 | enhancement | 🟢 | 2 | 複数LLM対応の設計検討 | 将来の複数LLMプロバイダー対応に向けた設計・ADRの検討 |
| yukkie/AgentVillage#25 | enhancement | 🟢 | 8 | Skill memory (cross-game learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#28 | enhancement | 🟢 | 8 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | enhancement | 🟢 | 8 | Persona community sharing | キャラテンプレートの共有 |

### 将来フェーズ

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#315 | enhancement | 🟢 | 8 | FastAPI + WebSocket backend | リアルタイムストリーミング（Milestone 2 完了後） |
| yukkie/AgentVillage#316 | enhancement | 🟢 | 13 | Mobile app (React Native) | iOS/Android 対応（#315 完了後） |
| yukkie/AgentVillage#30 | enhancement | 🟢 | 13 | State management DB migration | JSON → DB 移行 |
| yukkie/AgentVillage#424 | enhancement | 🟢 | 5 | Dev tool (1/2): AST-based relationship extraction for a central data type | 中心データ型を起点に producer/consumer/transform を AST で全列挙し隣接リスト出力。idd 事前調査から参照。汎用ツール（LogEvent は検証例） |
| yukkie/AgentVillage#425 | enhancement | 🟢 | 3 | Dev tool (2/2): smell evaluation over the extracted relationship graph | 抽出グラフ上で transform スメルを定義基準で分類・淀み度集計。依存: #424 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
