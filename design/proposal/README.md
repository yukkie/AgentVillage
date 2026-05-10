# Handoff: AI人狼 観戦ビューア (Agent-Wolf Spectator Viewer)

## Overview
LLMエージェント同士で進行する人狼ゲーム（`AgentVillage` の状態アーカイブを素材としたもの）を、観戦者（spectator）と参加者（public）の双方の視点で楽しめる Web アプリケーションのデザイン提案です。Reddit的な発見性と、人狼BBS的な議論密度の両立を目指しています。

提案範囲は **3つのコア画面 + 2つの UI スタディ**：
1. **観戦メイン画面** (Day議論 + ロスター + 夜行動)
2. **観戦ハブ（ゲーム一覧）** (LIVE村と過去戦のフィード)
3. **エージェント詳細** (特定botのプロファイル / 推論ログ / 疑い度マトリクス)

スタディ:
- 返信(reply-to) UI 3案 (引用ブロック / インデント＋接続線 / 参照ピル)
- spectator vs public 視点比較

## About the Design Files
このバンドルに含まれる HTML/JSX/CSS は **デザインリファレンス** です。Babel スタンドアロン + 直書き JSX で記述されており、そのまま本番投入する想定ではありません。**目標とする UI の見た目・挙動・情報設計の再現用カンプ** として扱ってください。

タスクは、これらの HTML プロトタイプを **対象コードベース（React, Vue, Next.js など既存環境がある場合はそれ）の確立されたパターン・ライブラリで作り直す** ことです。`AgentVillage` リポジトリにフロントエンドが既存でなければ、最も適した枠組み（推奨：Next.js + Tailwind / shadcn-ui ベース、または素の React + CSS Modules）を選んでください。

## Fidelity
**High-fidelity (hifi)**: 配色、タイポグラフィ、余白、余白、セミインタラクションが確定済みのモックです。コードベースのコンポーネント・ライブラリで **ピクセル等価に近い再現** をしてください。詳細値は `Design Tokens` 章を参照。

ただし以下は意図的にプレースホルダ：
- **エージェントの立ち絵**: 1文字 + グラデーションのモノグラム。実画像（または `<image-slot>` 相当の差替えスロット）に差し替える前提。
- **役職割当 / 投票内訳 / 夜の行動結果 / 偽CO真偽**: ログには無いため `screen-spectator.jsx` 内の `ROLE_ASSIGNMENT`, `CO_LIST`, `NIGHT_RESULTS`, `EXEC_RESULTS`, `VOTE_TABLE_D1`, `ACTIONS_TIMELINE` でモックしています。本番ではゲームエンジン側からこれらの構造を返すデータモデルが必要。

## Source Data
`source_logs/` に `AgentVillage/state_archive/20260510_102927` の `public_log.jsonl` と `spectator_log.jsonl`、各エージェントの `agents/*.json` を同梱しています。これは元データのフォーマット参考（実装時にどう取り込むかの基準）として使ってください。

`prototypes/data.js` は `window.GAME_DATA = { events, agents }` の形でブラウザに直接埋め込んでいます。本番ではこの構造をサーバ API のレスポンスシェイプとして使うのが自然です。

```ts
type GameData = {
  events: PublicEvent[];   // public_log.jsonl と互換 + spectator限定で thought フィールドが付く
  agents: Record<AgentName, AgentProfile>;
};

type PublicEvent = {
  id: string;
  day: number;
  phase: 'init' | 'day_discussion' | 'voting' | 'night' | ...;
  event_type: 'phase_start' | 'speech' | 'vote' | 'attack' | 'divine' | 'guard' | 'death';
  agent: AgentName | null;
  target: AgentName | null;
  content: string;
  is_public: boolean;
  speech_id: number | null;       // dayごとに1から振られる発言番号
  reply_to: number | null;        // 同day内の speech_id を参照
  claimed_role: Role | null;      // CO の宣言（公開）
  inspection_role: Role | null;   // 占い結果（spectatorのみ）
  reasoning: string;
  decision: string;
  thought?: string;               // spectator viewer のみ。THINK ログから注入
};
```

## Screens / Views

### 1. 観戦メイン画面 — `screen-spectator.jsx` (採用案: A. 詳細カード型)

**目的**: ある村の議論フェーズを LIVE 観戦する。中央に発言フィード、左にナビ、右にメタ情報。

**レイアウト** (1440 × 1000 設計):
- ヘッダー: `52px` 高、ブランド + 動的パンくず + LIVE / 同時観戦 / DL / 応援ボタン
- 本体: `grid-template-columns: 256px 1fr 360px` の3ペイン
  - 左: タイムライン (日付 → 議論/投票/夜) + フィルタ (役職 / 表示種別)
  - 中央: 発言フィード (スクロール可) + 投票内訳カード + 夜の通知バー
  - 右: ロスター (生存 / 死亡) + COボード + 夜の行動履歴

**発言カード** (`.speech` クラス):
- グリッド: `60px (avatar) | 1fr (body)`、`gap: 14px`、padding `16px 24px`
- 役職に応じた左帯のティント（人狼の発言は `linear-gradient(90deg, rgba(226,107,107,0.04), transparent)` を背景に）
- ヘッダー行: 名前 (Noto Serif JP 600 / 14px) → エージェントID (10px / `--tx-3`) → 役職タグ → COバッジ (該当時) → ターン番号 → タイムスタンプ
- 引用ボックス (`.sp-quote`): reply_to があるとき、参照先の冒頭 90 文字を `border-left: 2px solid var(--bd)` 付きで表示
- 本文: `13.5px / line-height 1.7`、`white-space: pre-wrap`、メンション (@Mira など) は `--info` でハイライト
- **思考ログピル** (`.sp-think summary`): 吹き出し SVG + 「思考ログを読む」+ 文字数。クリックで `<details>` が開き、左に山吹色 (`--acc`) の縦ライン + 思考全文。spectator モードでのみ表示。

**システム行** (`.sysrow`):
- GM / 死亡 / 処刑 / 夜フェーズ移行などの通知。`28px` 円形アイコン + ラベル + 本文 + タイムスタンプ。

**投票内訳** (`.vote-detail`):
- Day 終了時に挿入される。2列グリッドで「投票者 → 対象」を全件表示。処刑対象は `--danger` で強調。

**ロスター行** (`.roster-row`):
- グリッド: `32px (sm avatar) | 1fr (who) | auto (meter)`
- 死亡者は `opacity: 0.55`
- 容疑度メーターは `4px` 高の細バー + 数値

### 2. 観戦ハブ（ゲーム一覧） — `screen-list.jsx`

**目的**: r/agent-jinrou 的なコミュニティビュー。LIVE 進行中の村と完了済みの村が混在するフィード。

**レイアウト** (1440 × 1000 設計): `grid-template-columns: 240px 1fr 280px`
- 左: マイページ / カテゴリ / ルール / 注目エージェント のサイドナビ
- 中央: タブ (注目 / 熱い議論 / 新着 / 完了) → LIVE バナー → ゲームカードのリスト
- 右: 次回開催 / 勝率トップ / コミュニティ投稿

**ゲームカード** (`.gcard`):
- 左に `▲ / 数 / ▼` の縦投票列 (Reddit的)
- 本体: メタ行 (LIVE/完了タグ + 勝者バッジ + サブレ名 + ルール + 提供元) → タイトル → ロスターストリップ (キャストの立ち絵 8体まで + `+N`) → 末尾 (コメント数 / 観戦者数 / DL / 保存 / 共有)
- `.featured` (注目) は山吹色のボーダー + 微グラデ

### 3. エージェント詳細 — `screen-agent.jsx` (VS Code 風 collapsible panes)

**目的**: 特定の bot の素性をすべて把握する観戦者向けプロファイル。**観戦中の文脈** で使うため、左ペインに同じ村の他エージェントへのジャンプ機能を残す。

**レイアウト** (1280 × 1000 設計): `grid-template-columns: var(--lcol, 240px) 1fr var(--rcol, 320px)`
- 左ペイン: その村の全11名リスト。クリックで右に切り替え。並べ替え (発言数 / 容疑度 / 役職別)。
- 中央: ヒーロー (立ち絵 + 名前 + 役職バッジ + ペルソナ引用 + 統計3つ) → タブ (概要 / 推論ログ / 疑い・信頼 / 夜の行動 / プロンプト / 過去の戦績) → 現在の目標カード → 推論ログのタイムライン
- 右ペイン: 疑い度マトリクス (8人分、双方向バー) / 夜の行動履歴 / プロンプト構造

**Collapsible Panes**:
- 各サイドペインに `pane-handle`（チェブロンの 18×18 ボタン）。クリックで `.pane.collapsed` クラスを付与し、内部を `display: none` に切替。`.rail` (回転ラベル + 縦書きアイコン) を表示し、ペイン幅を `36px` に縮小 (`--lcol`, `--rcol` を CSS 変数で制御)。
- VS Code のサイドバー収納と同等のメンタルモデル。

### 4. UI スタディ: 返信表示 3 案 — `screen-reply-variants.jsx`

同じ親⇄子発言ペアを 3 通りで描き比較。決定: **A. 引用ブロック型** を採用。B (インデント＋接続線) は深いツリーで破綻するためオプション、C (参照ピル) は SNS 共有用の小サイズ表示で活用。

### 5. UI スタディ: spectator vs public 視点比較 — `screen-mode-compare.jsx`

同じ Day 2 の場面を **真の役職が見える観戦者視点** と **参加者と等価のpublic視点** で並列表示。差分:
| 要素 | spectator | public |
|---|---|---|
| 役職タグ | 真の役職を常時表示 | 自称COのみ。未COは「役職不明」 |
| 偽CO判定 | COバッジが赤＋「偽」マーク | 区別なし（COバッジは中立色） |
| 立ち絵刻印 | 役職名（占/狼/狂…） | 「?」のみ。死亡確定後にだけ確定刻印 |
| 思考ログ | 吹き出しピル → 展開可 | ロックバッジで存在のみ示す |
| ロスター | 役職アイコン入り | 役職不明 + COのみ表示 |

実装上は**同じ React コンポーネント**に `mode: 'spectator' | 'public'` の prop を渡し、見える要素を切り替える設計を推奨します（プロトタイプの `Stage` コンポーネントが参考）。

## Interactions & Behavior

- **発言カードの思考ログ**: `<details>` ベース。クリックで開閉。spectator モードでのみマウントされる。本番ではロール別 RBAC で gate するのが自然。
- **左/右ペインの折りたたみ** (③ 詳細画面): React state でクラスを付け外すだけ。CSS の `transition` で `--lcol`/`--rcol` を `220ms ease` で補間すると滑らか。
- **発言カード→詳細パネルへの飛び移り** (将来発展): 現状は別画面だが、ヘッダー名のクリックで右ペインに詳細スライドインさせる構想（提案ノート）。
- **LIVE 状態の表現**: `.live-dot` の `pulse` keyframes (1.6s)。
- **同期スクロール** (⑤ 視点比較画面): 左右の列を 1:1 でスクロール連動させる想定 (実装は scroll イベントで他列の `scrollTop` をミラー)。

## State Management

最低限必要な状態:

- `currentDay`, `currentPhase`, `currentTurn` — 観戦中のタイムカーソル
- `viewerMode: 'spectator' | 'public'` — 切替トグル
- `selectedAgent` — 詳細画面の現在対象
- `panesCollapsed: { left: boolean, right: boolean }` — ペインの折りたたみ
- `filters: { agents: Set<Name>, roles: Set<Role>, eventTypes: Set<EventType> }` — フィードのフィルタ
- `liveStream` — 進行中ゲームでは server-sent events / WebSocket でイベント追加

## Design Tokens

`prototypes/styles.css` の冒頭 `:root` ブロックがソース・オブ・トゥルース。主要値:

**Color (background)**
- `--bg: #0b0d12` / `--bg-1: #11141b` / `--bg-2: #171b24` / `--bg-3: #1f242f` / `--bg-elev: #20252f`

**Color (border)**
- `--bd: #262c39` / `--bd-soft: #1c212b`

**Color (text)**
- `--tx: #e7e9ef` / `--tx-2: #aab0bd` / `--tx-3: #777f8f` / `--tx-4: #4d5462`

**Color (role)**
- 村人 `--r-villager: #95a8bd`
- 占い師 `--r-seer: #6ea8ff`
- 霊媒師 `--r-medium: #58cfd8`
- 狩人 `--r-hunter: #6dd592`
- 狂人 `--r-madman: #e8a85c`
- 人狼 `--r-werewolf: #e26b6b`

**Color (status / accent)**
- `--alive: #6dd592` / `--dead: #6e7585` / `--warn: #e8a85c` / `--danger: #e26b6b` / `--info: #6ea8ff`
- `--acc: #f0c75f` (山吹色 / BBS的アクセント、CO・思考ログ・推論タイムラインのドットに使用)

**Radius**
- `--r1: 4px` / `--r2: 8px` / `--r3: 12px`

**Typography**
- `--serif: "Noto Serif JP", "Hiragino Mincho ProN", serif` — 見出し、名前、役職タグ、ヒーロー
- `--sans: "Noto Sans JP", -apple-system, "Helvetica Neue", sans-serif` — 本文、UI 一般
- `--mono: "JetBrains Mono", "SF Mono", Menlo, monospace` — 数値、ID、タイムスタンプ、token カウント
- 主要サイズ: 本文 `13px / line-height 1.55` (UI), 発言本文 `13.5px / 1.7`, セクションヘッダー `Noto Serif JP 600 / 14px`, 詳細ヒーロー名 `32px`

**Spacing scale (慣用)**
- `4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 / 40` の倍数を使用。8 / 12 / 16 が支配的。

**Shadow / Effect**
- 影は基本未使用（フラット）。立ち絵にだけ `box-shadow: 0 0 0 2px var(--av-c)` でハイライト。
- LIVE ドットの `pulse` keyframes (`box-shadow` で 0 → 6px のリング → fade)。

## Assets

- **エージェントの立ち絵**: 現状はモノグラム + グラデーション (`AGENT_PALETTE` を `common.jsx` で定義)。実装時は実画像 (PNG/WebP) に差し替え可能なスロットを用意。
- **役職アイコン**: 未使用（テキスト「占／狼／狂」を Serif で運用）。後期で SVG アイコン化する場合のために `--r-color` をキーに。
- **吹き出し / 鍵 / チェブロン SVG**: ディスクロージャー UI 用にインライン SVG で記述。再利用しやすいよう `<Icon>` コンポーネントに切り出すことを推奨。

## Files

`prototypes/`
- `index.html` — エントリ。Babel スタンドアロン + DesignCanvas で全アートボードを内包。
- `styles.css` — デザイントークン + 全コンポーネントの CSS。
- `data.js` — 実ログから抽出した `window.GAME_DATA`。
- `design-canvas.jsx` — 提案比較用の pan/zoom キャンバス（プロトタイプ専用、本番では破棄）。
- `common.jsx` — `Avatar` / `RoleTag` / `Mentioned` / `ROLES` / `AGENT_PALETTE`。
- `screen-spectator.jsx` — 観戦メイン画面 (採用 A 案)。`ROLE_ASSIGNMENT`, `CO_LIST`, `NIGHT_RESULTS`, `EXEC_RESULTS`, `VOTE_TABLE_D1`, `ACTIONS_TIMELINE` がモックデータ。
- `screen-spectator-dense.jsx` — B案 (高密度BBS型)。比較用、採用ではないが密度を上げたい局面用に保持を推奨。
- `screen-list.jsx` — ゲーム一覧。`GAMES` 配列がモック。
- `screen-agent.jsx` — エージェント詳細。collapsible panes 実装あり。
- `screen-reply-variants.jsx` — 返信 UI スタディ。
- `screen-mode-compare.jsx` — 観戦/参加者視点比較スタディ。

`source_logs/`
- `public_log.jsonl` / `spectator_log.jsonl` — 元の対戦ログ (第13回 桜霞)。
- `agents/*.json` — 各エージェントの設定 (persona, memory, etc.)。データモデルの参考として保持。

## 推奨実装順

1. **Design Tokens を移植** (`tokens.css` / Tailwind config / chakra theme などコードベースに合わせて)。
2. **Avatar / RoleTag / 共通プリミティブ** を実装。
3. **観戦メイン画面の発言カード単体** をストーリーブック化 → 役職別ティント、引用、思考ログ、CO バッジの全パターンを網羅。
4. **3ペインシェル + フィード** を組み立て、スタブデータで描画。
5. **API 接続** (`GameData` シェイプ) と **モード切替** (spectator/public) を後段で接続。
6. ゲーム一覧 → エージェント詳細の順で展開。

## Open Questions

- 役職割当・投票内訳・夜の行動結果・CO の真偽は、現行の JSONL ログには含まれていない。バックエンドで spectator 用のリッチなビューモデルを返す API を新設する必要あり。
- 立ち絵を実画像で運用する場合のアスペクト比 (現プロトタイプは 60×76 の縦長＝3:4)・推奨解像度を決めたい。
- 同時観戦数・応援スコアなど SNS 機能の有無 (削るならゲームカード末尾を簡略化)。
