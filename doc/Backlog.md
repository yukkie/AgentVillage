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


### Milestone 3（3画面完成 — AgentDetailScreen 含む）— 現 Sprint

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#630 | enhancement | 🔴 | 2 | feat: regenerate state_archive/index.json automatically after a CLI game | 現状 python tools/generate_archive_index.py を毎回手動実行しないと Web UI の一覧に新ゲームが出ない。main.py の archive_state() 直後で自動再生成する。tools/ は import 対象外のため実体の置き場所が設計判断 |
| yukkie/AgentVillage#629 | enhancement | 🟡 | 3 | feat(frontend): show village/wolf faction win rates alongside overall win rate | 通算勝率のみで陣営別が見えない。game_stats.json に faction が既にあるため JS 集計のみで実現可（Python 変更不要）。GameList ランキングと AgentDetail 戦績の両方に影響 |
| yukkie/AgentVillage#628 | tech-debt | 🟡 | 3 | fix(frontend): move shared config JSON out of public/ to stop Vite import warning | npm run dev の "Assets in public directory cannot be imported" 警告。agents/role_meta/roles.json を src/config/ へ移し blurb の fetch を import に一本化。src/config.py のパス定数も追従（案A） |
| yukkie/AgentVillage#623 | enhancement | 🟡 | 3 | feat(frontend): make GameListScreen rule filter real (roles.json-backed) | #541 が実装を後続送りにしたまま未起票だった分。ルールをroles.json駆動にしフィルターを実装。実在しない「妖狐入り」「短期戦」を撤去 |
| yukkie/AgentVillage#624 | enhancement | 🟢 | - | feat: launch a new game from NewVillageForm (connect to main.py) | #329 がスコープ外にした起動連携。ブラウザ→Python の受け口方式が Milestone 3(FastAPI) と重なるため着手前に方針確認。人数選択 8 が roles.json に無い不整合も解消。SP は方式次第 |
| yukkie/AgentVillage#466 | tech-debt | 🟡 | 5 | Refactor LogEvent payload design | #451 設計中に派生。LogEvent の event-specific payload を直下 optional field / extra_data / discriminated union のどれで整理するか比較検討する |
| yukkie/AgentVillage#495 | enhancement | 🟡 | 3 | design: log visibility classes and recipient-based authorization model (for LIVE / player participation) | LIVE/プレイヤー参加に向け、可視性クラス×受信者権限の配信認可モデルを先行設計（ADR）。replay は全配信の特殊ケース |
| yukkie/AgentVillage#319 | enhancement | 🟢 | 3 | feat(frontend): LIVE spectator (real-time view of in-progress game) | state/ を tail して進行中ゲームを表示（将来フェーズ） |
| yukkie/AgentVillage#364 | enhancement | 🟢 | 5 | refactor: introduce SpectatorScreen view model indexes | SpectatorScreen 用 view model/index を導入し render 中の events 全走査を減らす。両 screen の prevById/visibleDays/roleAssignment 重複解消＋挙動差判定を含む。実装順序制約: #596 → #364 |
| yukkie/AgentVillage#323 | enhancement | 🟢 | 3 | feat(frontend): i18n support for frontend UI strings (ja/en) | JSX 内の日本語ハードコードを locale リソースに外出しし、ja/en 切り替えに対応 |
| yukkie/AgentVillage#379 | enhancement | 🟢 | 3 | Add static type checking to frontend JS (JSDoc or TypeScript) | フィールド名ミスをエディタ/CIで検出できるようにする。スタブ撤廃（#318）以降に検討 |

### ゲームロジック系（Web UI 軸とは別系統）

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#207 | tech-debt | 🔴 | 1 | Add 'Why' rationale to project-discipline.md for key development process decisions | 主要プロセス決定の Why を project-discipline.md に記載し SKILL.md から参照する |
| yukkie/AgentVillage#305 | bug | 🔴 | 1 | fix: include claimed_role in wolf prompts to prevent role-flip CO | claimed_role がプロンプトに渡されず、狼が自分の偽CO済み役職を忘れて別役職にCOしてしまう |
| yukkie/AgentVillage#248 | enhancement | 🟡 | 2 | Feat: pass wolf CO reasoning to discussion phase prompt | 夜の偽CO決定時の reasoning を翌日 DISCUSSION フェーズのプロンプトに含め、狼の発言一貫性を高める |
| yukkie/AgentVillage#266 | tech-debt | 🟡 | 5 | Replace intended_co flag with a typed scheduled-event model | intended_co をフラグから timing 付きスケジュール済みイベント型に置き換え、ライフサイクルを型で表現する |
| yukkie/AgentVillage#23 | enhancement | 🟡 | 3 | Auto-summarize memory_summary when it grows too long | 記憶が長くなったら LLM で自動要約 |
| yukkie/AgentVillage#227 | enhancement | 🟡 | 2 | Add early exit for wolf night chat consensus | 全狼の最新攻撃候補が一致したら夜会話を早期終了し、未合意時は既存ラウンド継続を維持する |
| yukkie/AgentVillage#468 | tech-debt | 🟡 | 2 | Improve IDD smell detection for schema drift | #451/#466 から派生。中心契約型への field 追加時に schema drift を検知する IDD スキル定義を再検討する |
| yukkie/AgentVillage#26 | enhancement | 🟢 | 2 | Thought log display mode switching (debug vs spectator) | 思考ログの表示モード切り替え |
| yukkie/AgentVillage#79 | enhancement | 🟢 | 5 | Log analysis agent skill for post-game review | ゲームログをAgentに委譲して解析・サマリーを返すスキル |
| yukkie/AgentVillage#45 | enhancement | 🟢 | 5 | Introduce promptfoo for LLM output testing | speech/thought/intent の品質を CI で自動検証 |
| yukkie/AgentVillage#138 | enhancement | 🟢 | 2 | Evaluate structured output libraries for future multi-provider/tool-use support | 将来の複数LLMプロバイダー対応に向けた設計・ADRの検討 |
| yukkie/AgentVillage#25 | enhancement | 🟢 | 8 | Skill memory (cross-game persistent learning) | ゲームをまたいで引き継がれる戦略記憶 |
| yukkie/AgentVillage#28 | enhancement | 🟢 | 8 | Human player participation mode | 人間がエージェントとして参加 |
| yukkie/AgentVillage#29 | enhancement | 🟢 | 8 | Persona / character template community sharing | キャラテンプレートの共有 |

### 将来フェーズ

| # | 種別 | 優先度 | SP | タイトル | 内容 |
|---|---|---|---|---|---|
| yukkie/AgentVillage#315 | enhancement | 🟢 | 8 | feat: FastAPI + WebSocket backend for real-time web streaming | リアルタイムストリーミング（Milestone 2 完了後） |
| yukkie/AgentVillage#316 | enhancement | 🟢 | 13 | feat: mobile app (React Native) | iOS/Android 対応（#315 完了後） |
| yukkie/AgentVillage#30 | enhancement | 🟢 | 13 | State management DB migration (SQLite → PostgreSQL) | JSON → DB 移行 |
| yukkie/AgentVillage#593 | bug | 🟢 | - | Dev tool: type-lineage typed-path defects & gaps (batch) | #424/#581 のマージ後レビューで検出した typed 経路の取りこぼし・意味論バグの一括起票（14件）。**着手前に `/issue split` 必須**（SP は分割後の子に振るため親は無印）。#583（heuristic read 抽出）とは独立。依存: #424(closed), #581(closed) |
| yukkie/AgentVillage#583 | enhancement | 🟢 | 5 | 開発ツール: type-lineage の heuristic/untyped read 抽出（動的型付け Python プロジェクト向け） | typed 経路で拾えない heuristic/untyped な read を抽出。AgentVillage 自体へのベネフィットは≈ゼロで、動的型付けの別プロジェクトへ転用するときに価値が出る。#593 とは独立 |
| yukkie/AgentVillage#508 | enhancement | 🟢 | 5 | Dev tool (2/3): JS field-access extraction | JS consumer のフィールド read をヒューリスティック抽出し #424 の隣接リストに統合（source: js / confidence: heuristic）。#379 導入後は型起点へ強化。依存: #424 |
| yukkie/AgentVillage#425 | enhancement | 🟢 | 3 | Dev tool (3/3): smell evaluation skill over the extracted relationship graph | #424 のグラフに判定基準を適用する AI 評価スキル（判定コードは書かない）。淀み度集計＋4評価軸。依存: #424。SP 再見積もり対象 |
| yukkie/AgentVillage#543 | enhancement | 🟢 | 8 | Dev tool: machine-managed Issue dependency graph (bidirectional) | issue SKILL.md の依存配線（依存:/依存される Issue:/順序制約）を機械抽出し隣接リスト化。片方向リンク・分割時の張り替え漏れを整合性チェックで検出。#424 の隣接リスト／2層分離思想を踏襲。依存: #424 |

---

## 未整理メモ

*新しいアイデアはここに追記する*
