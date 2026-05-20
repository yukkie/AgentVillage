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
| yukkie/AgentVillage#314 | enhancement | 🔴 | 2 | spectator / public mode toggle | viewerMode prop による表示切替。#350 のブロッカー |
| yukkie/AgentVillage#351 | enhancement | 🔴 | 2 | Structured game_over event with winner field + frontend result screen | game_over に winner フィールドを追加し文字列パース依存を除去。観戦画面に勝敗サマリーを表示 |
| yukkie/AgentVillage#344 | tech-debt | 🟡 | 3 | Design: LogEvent cannot express mixed public/private fields in a single speech event | speech イベントの公開/非公開混在問題の設計を定め Architecture.md に記載、[THINK] ハックを廃止する設計Issueを作る |
| yukkie/AgentVillage#352 | enhancement | 🟡 | 1 | Show prologue message on game start in SpectatorScreen feed | GAME START 時にプロローグ固定文をフォールバック表示。将来の role_assigned イベント実装時に差し替え |
| yukkie/AgentVillage#353 | enhancement | 🟡 | 1 | Emit role_assigned events at game start for each agent | init フェーズで全エージェント分の役職割り当てイベントを spectator_log に出力。#352 のフォールバック差し替え用 |
| yukkie/AgentVillage#357 | tech-debt | 🔴 | 2 | Remove remaining stub fallbacks in SpectatorScreen (NIGHT_RESULTS, VOTE_TABLE_D1, ACTIONS_TIMELINE, ROLE_ASSIGNMENT) | #346 で未対応のスタブ依存4件を実ログ由来データに差し替え、stub/spectator.js の import を完全除去 |
| yukkie/AgentVillage#350 | enhancement | 🟡 | 3 | Rework SpectatorScreen right pane — role display, real log actions, day-linked view | 容疑度メーター削除・役職表示改善・夜行動実ログ接続・左ペイン日付クリック連動。#314/#346 依存 |
| yukkie/AgentVillage#347 | enhancement | 🟡 | 3 | Implement feed filters in SpectatorScreen left pane (agent / role / event type) | 参加者・役職・表示種別フィルターチップを実際に動作させる。追加データ不要でクライアントサイドのみで実装可能 |
| yukkie/AgentVillage#337 | enhancement | 🟡 | 2 | Top agents real stats | stub/gameList.js の TOP_AGENTS を実ゲーム結果の集計データに置き換え |
| yukkie/AgentVillage#319 | enhancement | 🟡 | 3 | LIVE spectator | state/ を tail して進行中ゲームを表示（Milestone 2 後半） |
| yukkie/AgentVillage#321 | enhancement | 🟢 | 2 | Unify config data as shared JSON (SSOT) | config/*.json を Python/JS 共有にして constants.js のハードコードを廃止 |
| yukkie/AgentVillage#323 | enhancement | 🟢 | 3 | i18n support for frontend UI strings (ja/en) | JSX 内の日本語ハードコードを locale リソースに外出しし、ja/en 切り替えに対応 |
| yukkie/AgentVillage#342 | enhancement | 🟢 | 3 | Introduce React Router for game and agent detail navigation | React Router 導入。AgentDetailScreen 依存 |

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
