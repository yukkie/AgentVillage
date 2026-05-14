# AgentVillage — Ideas & Issue Tracker

アイデアの卵はここに書く。Claude が整理して適切なドキュメントまたは GitHub Issues に振り分ける。

プロジェクトコンセプト・ゲームスタイル → [README.md](../README.md)
ゲームルール・機能仕様 → [Spec.md](Spec.md)
アーキテクチャ・コンポーネント設計 → [Architecture.md](Architecture.md)
モジュール詳細設計 → [DetailDesign.md](DetailDesign.md)

---

## GitHub Issues（未実装タスク）

並び順は Sprint Goal に沿って Milestone 1 → Milestone 2 → ゲームロジック系（Web UI 軸とは別系統） → 将来フェーズの順。
同一区分内では優先度（🔴 → 🟡 → 🟢）で並べる。

### Milestone 1（Mock 観戦）

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#328 | enhancement | 🔴 | 2 | Add collapsible side panes to all 3-pane screens | ThreePaneLayout に collapse 機能を追加し、全3画面で左右ペインを折りたたみ可能にする |
| yukkie/AgentVillage#331 | tech-debt | 🔴 | 2 | Write frontend design document | Milestone 2 着手前に doc/FrontendDesign.md を新設（コンポーネント・CSS方針・画面遷移仕様） |
| yukkie/AgentVillage#312 | enhancement | 🔴 | 3 | GameData registry | doc/GameData.md でデータギャップを継続管理（Milestone 1/2 横串） |

### Milestone 2（実データ観戦）

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#318 | enhancement | 🟡 | 3 | Replay viewer | state_archive/ から過去ゲームを表示（Milestone 2 前半） |
| yukkie/AgentVillage#319 | enhancement | 🟡 | 3 | LIVE spectator | state/ を tail して進行中ゲームを表示（Milestone 2 後半） |
| yukkie/AgentVillage#314 | enhancement | 🟡 | 2 | spectator / public mode toggle | viewerMode prop による表示切替 |
| yukkie/AgentVillage#321 | enhancement | 🟡 | 2 | Unify config data as shared JSON (SSOT) | config/*.json を Python/JS 共有にして constants.js のハードコードを廃止。Architecture.md に配置指針を追記 |
| yukkie/AgentVillage#323 | enhancement | 🟡 | 3 | i18n support for frontend UI strings (ja/en) | JSX 内の日本語ハードコードを locale リソースに外出しし、ja/en 切り替えに対応。#309 実装中に発見 |

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

---

## 未整理メモ

*新しいアイデアはここに追記する*
