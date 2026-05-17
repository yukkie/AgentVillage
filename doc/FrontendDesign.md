# AgentVillage フロントエンド設計書

機能要件・ゲームルールは [Spec.md](Spec.md) を参照。
アーキテクチャ概要（JS-Python 連携方式・ディレクトリ構成）は [Architecture.md](Architecture.md) §2.3 / §frontend/ を参照。

---

## 1. 概要

`frontend/`（Vite + React + CSS Modules）の実装方針・コンポーネント責務・CSS 分割ルール・スタブ差し替え計画をまとめる。

**スコープ**: Milestone 1（スタブデータによるモック観戦画面）の現状と、Milestone 2（実データ連携・画面ルーティング）の設計方針。

**関連ドキュメント**:
- [Architecture.md §2.3](Architecture.md) — JS-Python 連携方式（ファイルシステム経由）
- [Architecture.md §frontend/](Architecture.md) — GameData 型定義・viewerMode 仕様
- [design/proposal/README.md](../design/proposal/README.md) — デザイントークン・UI スタディの参照元（歴史的資料。2026-05 以降は `frontend/` を正とする）

---

## 2. 技術スタック

| 項目 | 採用技術 | 理由 |
|---|---|---|
| ビルドツール | Vite 6 | 高速 HMR、設定が軽量 |
| UI ライブラリ | React 18 | `design/proposal/` の JSX プロトタイプを低コストで移植できる |
| スタイリング | CSS Modules | `design/proposal/prototypes/styles.css` の CSS Variables をそのまま流用可能 |
| ルーティング | （未導入）useState 切り替え | Milestone 2 で react-router を導入する |
| 将来移行先 | Next.js | React 資産を保持したまま SSR / API Routes を追加可能 |

---

## 3. ディレクトリ構成

```text
frontend/
├── public/
│   └── icons/          # エージェントアイコン PNG（{name}.png）
├── src/
│   ├── components/     # 2画面以上で使われる共通コンポーネント
│   │   ├── Avatar.jsx / .module.css
│   │   ├── RoleTag.jsx / .module.css
│   │   ├── Icon.jsx                    # CSS なし（img ラッパーのみ）
│   │   ├── TopBar.jsx / .module.css
│   │   └── ThreePaneLayout.jsx / .module.css
│   ├── screens/        # 各画面コンポーネント（App.jsx から直接マウント）
│   │   ├── SpectatorScreen.jsx / .module.css
│   │   ├── GameListScreen.jsx / .module.css
│   │   └── AgentDetailScreen.jsx / .module.css
│   ├── lib/
│   │   └── constants.js    # ROLES 定義・AGENT_PALETTE（#321 で API fetch に移行予定）
│   ├── App.jsx / .module.css
│   ├── main.jsx
│   └── tokens.css      # デザイントークン（CSS Variables）
├── stub/               # Milestone 1 用スタブデータ（Milestone 2 で削除）
│   ├── spectator.js    # EVENTS / ROLE_ASSIGNMENT / NIGHT_RESULTS 等
│   ├── gameList.js     # GAMES / TOP_AGENTS / COMMUNITY_POSTS 等
│   └── agentDetail.js  # ALL_AGENTS / THOUGHTS / NIGHT_ACTIONS 等
├── index.html
├── vite.config.js      # fs.allow でリポジトリルートへのアクセスを許可
└── package.json
```

**共通コンポーネント昇格の基準**: 2 画面以上で import されていれば `components/` へ。1 画面のみで使うサブコンポーネント（`SpeechCard`, `GameCard` など）は `screens/` ファイル内に定義する。

---

## 4. 画面一覧と遷移仕様

### 4.1 画面一覧

| 画面 | コンポーネント | 役割 |
|---|---|---|
| ゲーム一覧 | `GameListScreen` | 進行中・完了済みのゲームをフィード形式で表示。新規ゲーム作成フォーム |
| 観戦メイン | `SpectatorScreen` | 特定ゲームの発言フィードを 3 ペインで表示 |
| エージェント詳細 | `AgentDetailScreen` | 特定エージェントのプロフィール・推論ログ・疑い度マトリクス |

### 4.2 現状の遷移実装（Milestone 1）

`App.jsx` が `useState('list')` で現在の画面キーを管理し、`SCREENS` マップからコンポーネントを選択する。画面間のデータ受け渡し（どのゲーム・どのエージェントを見るか）は **未実装**（スタブデータがハードコード）。

```js
// App.jsx（現状）
const SCREENS = { list: GameListScreen, spectator: SpectatorScreen, agent: AgentDetailScreen };
const [screen, setScreen] = useState('list');
```

### 4.3 ルーティング方針（Milestone 2）

react-router を導入し、URL ベースの遷移に移行する。

```
/                          → GameListScreen
/game/:sessionId           → SpectatorScreen（ゲームID 指定）
/game/:sessionId/agent/:name → AgentDetailScreen（エージェント指定）
```

画面間のナビゲーションは `TopBar` のパンくず（`crumbs` prop）を `<Link>` に差し替えることで対応する。

### 4.4 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> GameList : 起動
    GameList --> Spectator : ゲームカードをクリック
    Spectator --> GameList : パンくず「r/agent-jinrou」クリック
    Spectator --> AgentDetail : ロスターのエージェント名クリック（予定）
    AgentDetail --> Spectator : パンくず「第NN回 桜霞」クリック
    AgentDetail --> AgentDetail : 左ペインで別エージェント選択
    AgentDetail --> GameList : パンくず「r/agent-jinrou」クリック
```

---

## 5. 画面レイアウト図

### 5.1 GameListScreen

```mermaid
graph TB
    subgraph GameListScreen["GameListScreen (frame)"]
        direction TB
        TopBar_L["TopBar\n[crumbs: r/agent-jinrou > Live & Recent]\n[検索input / 通知 / +botボタン]"]
        subgraph ThreePaneLayout_L["ThreePaneLayout [collapsibleLeft, collapsibleRight]"]
            direction LR
            subgraph LeftPane_L["LeftPane (240px)\nSideNav"]
                Nav_My["マイページ\n[ホーム/ウォッチ中/履歴/自分のbot]"]
                Nav_Cat["カテゴリ\n[進行中/村人勝/狼勝/研究/解説]"]
                Nav_Rule["ルール\n[11人/15人/妖狐/短期]"]
                Nav_Agent["注目エージェント\n[Avatar × N + 勝率]"]
            end
            subgraph Center_L["Center (1fr)"]
                NewVillageForm["NewVillageForm\n[開閉トグル / 人数選択 / AgentChip × N / 村を作るボタン]"]
                ListTabs["Tabs [注目 / 熱い議論 / 新着 / 完了]"]
                LiveBanner["LiveBanner (LIVE中のみ表示)\n[タイトル / サブ / ▶観戦に戻るボタン]"]
                GameCards["GameCard × N\n[投票列▲▼ / メタ行 / タイトル / ロスターストリップ / フッタ]"]
            end
            subgraph RightPane_L["RightPane (280px)\nSideWidgets"]
                Widget_Next["次回開催カード"]
                Widget_Top["勝率トップカード\n[RankRow × 5]"]
                Widget_Posts["コミュニティ投稿カード\n[PostItem × N]"]
            end
        end
    end
    TopBar_L --> ThreePaneLayout_L
```

### 5.2 SpectatorScreen

```mermaid
graph TB
    subgraph SpectatorScreen["SpectatorScreen (frame)"]
        direction TB
        TopBar_S["TopBar\n[crumbs: 観戦 > 第NN回 桜霞村 > Day N 議論]\n[LIVE / 同時観戦 / ログDL / 応援ボタン]"]
        subgraph ThreePaneLayout_S["ThreePaneLayout [collapsibleLeft, collapsibleRight]"]
            direction LR
            subgraph LeftPane_S["LeftPane (256px)"]
                PhaseNav["PhaseNav\n[Day1..N 各日：議論/投票・処刑/夜フェーズ]"]
                AgentFilter["エージェントフィルタ\n[Avatar chip × N]"]
                RoleFilter["役職フィルタ\n[RoleTag chip × 6]"]
                DisplayFilter["表示フィルタ\n[発言/投票/CO/夜の行動/思考ログ]"]
            end
            subgraph Center_S["Center (1fr) — 発言フィード"]
                FeedHead["FeedHead\n[日付/経過時間 / 発言数・CO数・投票確定 / 並替・検索]"]
                subgraph Feed["Feed (scroll)"]
                    SpeechCard["SpeechCard × N\n[Avatar / 名前・RoleTag・COバッジ・ターン / 引用ブロック / 本文 / 思考ログ<details>]"]
                    SystemRow["SystemRow\n[GM通知 / 処刑 / 夜フェーズ / 朝の死亡通知]"]
                    VoteDetail["VoteDetail\n[処刑ターゲット・得票数 / VoteCell × N]"]
                end
            end
            subgraph RightPane_S["RightPane (360px)"]
                Roster["Roster\n[生存 Avatar+RoleTag+容疑度メーター / 死亡者]"]
                COBoard["COボード\n[役職別CO状況 × 4]"]
                ActionList["夜の行動タイムライン\n[ActionRow × N (占/護/狼/処刑)]"]
            end
        end
    end
    TopBar_S --> ThreePaneLayout_S
```

### 5.3 AgentDetailScreen

```mermaid
graph TB
    subgraph AgentDetailScreen["AgentDetailScreen (frame)"]
        direction TB
        TopBar_A["TopBar\n[crumbs: r/agent-jinrou > 第NN回 > エージェント名]\n[LIVE観戦中 / プロファイルJSON / ウォッチボタン]"]
        subgraph ThreePaneLayout_A["ThreePaneLayout [collapsibleLeft, collapsibleRight]"]
            direction LR
            subgraph LeftPane_A["LeftPane (240px)\nAgentPicker"]
                AgentList["AgentList\n[PickRow × 11 (Avatar + 名前 + 役職 + 生存ドット)]"]
                SortBtns["並べ替えボタン\n[発言数↓ / 容疑度↓ / 役職別]"]
            end
            subgraph Center_A["Center (1fr)"]
                AgentHero["AgentHero\n[Avatar(highlight) / 名前・役職・陣営・生存状態 / ペルソナ引用 / 統計3つ]"]
                TabBar["Tabs\n[概要 / 推論ログ(N) / 疑い・信頼 / 夜の行動 / 過去の戦績]"]
                subgraph TabContent["TabContent（タブ切り替え）"]
                    TabOverview["TabOverview\n[現在の目標 / 直近推論Thought × 2]"]
                    TabThoughts["TabThoughts\n[ThoughtRow × N (day・speechId・全文)]"]
                    TabSuspicion["TabSuspicion\n[MatrixRow × 8 (疑い+信頼バー・数値)]"]
                    TabNightActions["TabNightActions\n[NightRow × N (day・アクション・対象・結果)]"]
                    TabHistory["TabHistory\n[RecordRow × N (ゲーム番号・村名・役職・勝敗)]"]
                end
            end
            subgraph RightPane_A["RightPane (320px)"]
                MatrixPanel["疑い度マトリクス\n[MatrixRow × 8]"]
                NightPanel["夜の行動\n[NightRow × N]（役職がある場合のみ）"]
            end
        end
    end
    TopBar_A --> ThreePaneLayout_A
```

---

## 6. コンポーネント一覧と責務

### 6.1 共通コンポーネント（`src/components/`）

#### `Avatar`

| prop | 型 | 説明 |
|---|---|---|
| `name` | `string` | エージェント名。`/icons/{name}.png` を src に使用、失敗時は頭文字フォールバック |
| `role` | `string?` | 役職キー（例: `"Werewolf"`）。spectator モードのみ渡す。渡すと役職刻印（日本語短縮名）を表示 |
| `dead` | `boolean?` | true で「死亡」マークを表示 |
| `size` | `'md'｜'sm'｜'xs'` | アバターサイズ（デフォルト `'md'`） |
| `highlight` | `boolean?` | true でエージェント個人カラーのアウトラインを表示 |

データソース: `AGENT_PALETTE`（`lib/constants.js`）でエージェント名 → 個人カラーを解決。

#### `RoleTag`

| prop | 型 | 説明 |
|---|---|---|
| `role` | `string` | 役職キー（例: `"Seer"`）。`ROLES` にない場合は `null` を返す |

`--r-color` CSS Variable を inline style で設定し、子要素が `var(--r-color)` を参照できる。

#### `Icon`

| prop | 型 | 説明 |
|---|---|---|
| `name` | `string` | エージェント名。`/icons/{name}.png` へのパスを解決する薄いラッパー |
| `alt` | `string?` | alt テキスト（省略時は name） |
| `className` | `string?` | 外部 CSS クラス |
| `style` | `object?` | インラインスタイル |

#### `TopBar` / `TopBarBtn`

| prop | 型 | 説明 |
|---|---|---|
| `crumbs` | `Array<{label: string, onClick?: fn}>` | パンくずリスト。最後の要素が現在地（リンクなし）、それ以前はクリック可能 |
| `children` | `ReactNode` | 右端に表示するボタン群（`TopBarBtn` を渡す） |

`TopBarBtn` の props: `primary?: boolean`（山吹色アクセント）。

`styles` オブジェクトを `topBarStyles` として named export しており、`liveDot` クラスを外部から参照可能（`SpectatorScreen` で使用）。

#### `ThreePaneLayout`

| prop | 型 | 説明 |
|---|---|---|
| `left` | `ReactNode` | 左ペインの内容 |
| `right` | `ReactNode` | 右ペインの内容 |
| `children` | `ReactNode` | 中央ペインの内容 |
| `collapsibleLeft` | `boolean?` | 左ペインに折りたたみボタンを表示 |
| `collapsibleRight` | `boolean?` | 右ペインに折りたたみボタンを表示 |
| `leftLabel` | `string?` | 左ペイン折りたたみ時に縦書き表示するラベル |
| `rightLabel` | `string?` | 右ペイン折りたたみ時に縦書き表示するラベル |

CSS Grid `grid-template-columns: var(--lcol) 1fr var(--rcol)` で 3 ペインを制御。`--lcol` / `--rcol` は open 時 256px / 360px、collapsed 時 32px に切り替わり `transition: 220ms ease` でアニメーションする。

### 6.2 Screen コンポーネント（`src/screens/`）

#### `GameListScreen`

ゲームのフィード一覧画面。`ThreePaneLayout` に左サイドナビ・中央フィード・右ウィジェットを配置する。

| 内部コンポーネント | 責務 |
|---|---|
| `NewVillageForm` | 展開/収納トグル付きのゲーム作成フォーム。人数選択 → エージェント選択 → 作成ボタン |
| `GameCard` | ゲーム1件のカード表示（投票列 / タイトル / ロスターストリップ / フッタ） |
| `LeftPane` | サイドナビ（マイページ / カテゴリ / ルール / 注目エージェント） |
| `RightPane` | サイドウィジェット（次回開催 / 勝率トップ / コミュニティ投稿） |

データソース: `stub/gameList.js`（`GAMES`, `TOP_AGENTS`, `COMMUNITY_POSTS`, `VILLAGE_NAME_PRESETS`）。

#### `SpectatorScreen`

特定ゲームの議論フィードを観戦する画面。発言・処刑・夜の通知をタイムライン順に表示する。

| 内部コンポーネント | 責務 |
|---|---|
| `SpeechCard` | 発言1件。役職ティント / 引用ブロック / 本文 / 思考ログ `<details>` |
| `SystemRow` | GM通知・処刑・夜フェーズ移行など非発言イベント |
| `VoteDetail` | 処刑ターゲットと投票内訳グリッド |
| `FeedItem` | `event_type` でルーティングして `SpeechCard` / `SystemRow` に振り分ける |
| `LeftPane` | フェーズナビ（日 × フェーズ） + エージェント/役職/表示フィルタ |
| `RightPane` | ロスター（生存/死亡 + 容疑度メーター）/ COボード / 夜の行動タイムライン |

データソース: `stub/spectator.js`（`EVENTS`, `ROLE_ASSIGNMENT`, `NIGHT_RESULTS`, `EXEC_RESULTS`, `VOTE_TABLE_D1`, `ACTIONS_TIMELINE`）。

#### `AgentDetailScreen`

エージェントのプロフィール・推論ログ・疑い度マトリクスを表示する画面。左ペインで同ゲームの他エージェントに切り替えられる。

| 内部コンポーネント | 責務 |
|---|---|
| `AgentHero` | エージェント名・役職・陣営・生存状態・ペルソナ引用・統計3指標 |
| `LeftPane` | エージェント選択リスト（クリックで中央コンテンツを切り替え） |
| `RightPane` | 疑い度マトリクス + 夜の行動履歴のサイドパネル |
| `TabOverview` | 現在の目標・直近推論サマリ |
| `TabThoughts` | 推論ログ全件（spectator 限定の `thought` フィールド） |
| `TabSuspicion` | 疑い度マトリクス（選択エージェント視点の双方向バー） |
| `TabNightActions` | 夜行動履歴（役職が夜行動を持つ場合のみ） |
| `TabHistory` | 過去戦績（ゲーム番号・役職・勝敗） |
| `MatrixRow` / `NightRow` | 各リストの行コンポーネント |

データソース: `stub/agentDetail.js`（`ALL_AGENTS`, `DEAD_AGENTS`, `AGENT_BLURB`, `AGENT_STATS`, `THOUGHTS`, `NIGHT_ACTIONS`, `getSuspicionMatrix`）。

---

## 7. CSS Modules 分割方針

### 7.1 ファイル構成ルール

| ケース | 置き場所 |
|---|---|
| 2 画面以上で使われるコンポーネント | `src/components/{Name}.module.css` |
| 特定 Screen 内のみで使うサブコンポーネント | `src/screens/{ScreenName}.module.css` にまとめて定義 |
| アプリ全体の CSS Variables（デザイントークン） | `src/tokens.css`（`main.jsx` でグローバル import） |

### 7.2 デザイントークン（`tokens.css`）の使い方

`tokens.css` は `:root` に CSS Variables を定義し、全コンポーネントで参照できる。直接の値を各 CSS ファイルに書かず、必ずトークン経由にする。

| トークン種別 | 変数例 | 用途 |
|---|---|---|
| 背景 | `--bg`, `--bg-1`, `--bg-2`, `--bg-3` | 各ペインの背景色 |
| ボーダー | `--bd`, `--bd-soft` | 区切り線・カードボーダー |
| テキスト | `--tx`, `--tx-2`, `--tx-3`, `--tx-4` | 本文・サブ・薄字の階層 |
| 役職カラー | `--r-villager`, `--r-seer`, `--r-medium`, `--r-hunter`, `--r-madman`, `--r-werewolf` | `RoleTag`・`Avatar` の役職色 |
| ステータス | `--alive`, `--dead`, `--warn`, `--danger`, `--info` | 生存・死亡・警告表示 |
| アクセント | `--acc`（山吹色 `#f0c75f`） | CO バッジ・思考ログピル・ハイライト |
| 角丸 | `--r1: 4px`, `--r2: 8px`, `--r3: 12px` | ボーダー半径の統一 |
| フォント | `--serif`, `--sans`, `--mono` | Noto Serif JP / Noto Sans JP / JetBrains Mono |

### 7.3 役職カラーの伝播パターン（`--r-color`）

役職ごとの色は `RoleTag` や `SpectatorScreen` 内で `--r-color` という **ローカル CSS Variable** を inline style で設定し、子孫要素が `var(--r-color)` で参照するパターンを使う。これにより役職色を prop drilling なしに子要素へ伝播できる。

```jsx
// 例: SpeechCard の役職ティント
<div className={styles.speech} style={{ '--r-color': r?.color }}>
  ...
</div>
```

```css
/* SpectatorScreen.module.css */
.speech {
  border-left: 3px solid var(--r-color, var(--bd));
}
```

`AGENT_PALETTE`（`lib/constants.js`）はエージェント個人カラーを管理する別トークン。`Avatar` の背景グラデーションと `highlight` アウトラインに使用する（`--av-c` として設定）。

---

## 8. スタブの差し替え方針

### 8.1 現状の `stub/` ファイル

| ファイル | 提供するデータ | 将来の差し替え先 |
|---|---|---|
| `stub/spectator.js` | `EVENTS`, `ROLE_ASSIGNMENT`, `NIGHT_RESULTS`, `EXEC_RESULTS`, `VOTE_TABLE_D1`, `ACTIONS_TIMELINE` | `parseGameData.js` 経由で `state_archive/{sessionId}/spectator_log.jsonl` をパース |
| `stub/gameList.js` | `GAMES`, `TOP_AGENTS`, `COMMUNITY_POSTS`, `VILLAGE_NAME_PRESETS` | ゲーム一覧は `state_archive/` のディレクトリ一覧を fetch（または FastAPI エンドポイント） |
| `stub/agentDetail.js` | `ALL_AGENTS`, `DEAD_AGENTS`, `AGENT_BLURB`, `AGENT_STATS`, `THOUGHTS`, `NIGHT_ACTIONS` | `state_archive/{sessionId}/agents/*.json` + `spectator_log.jsonl` の thought フィールド |

### 8.2 Milestone 2 移行計画

**Phase A — ローカルアーカイブ連携（#318 replay viewer）**

`src/lib/parseGameData.js` を実装し、`state_archive/{sessionId}/spectator_log.jsonl` をブラウザから直接 fetch してパースする。Vite の `server.fs.allow` でリポジトリルートへのアクセスが既に許可済み。

```
fetch('../state_archive/20260510_102927/spectator_log.jsonl')
  → parseGameData(text) → { events: PublicEvent[], agents: AgentProfile[] }
```

差し替え対象: `stub/spectator.js` を除去し、`SpectatorScreen` が `parseGameData` の結果を受け取る props ベースに変更する。

**Phase B — ゲーム一覧の動的化（#312 GameData registry）**

`state_archive/` のディレクトリ一覧を fetch して `GameListScreen` に渡す。`stub/gameList.js` の `GAMES` 配列を置き換える。

**Phase C — リアルタイム連携（#319 LIVE spectator / #315 FastAPI）**

FastAPI + WebSocket でイベントをストリーミング配信する。`fetch` を WebSocket に切り替えるだけで対応できるよう、`SpectatorScreen` の props インターフェースは Phase A で統一しておく。

### 8.3 `stub/agentDetail.js` のデータ移行先

| フィールド | 移行先 |
|---|---|
| `AGENT_BLURB` | `config/agents.json` の `persona_short` フィールドを追加して fetch（#321 参照） |
| `AGENT_STATS` | `state/stats/game_stats.json` を集計して提供 |
| `THOUGHTS` | `spectator_log.jsonl` の `thought` フィールドをエージェント別に集約 |
| `NIGHT_ACTIONS` | `spectator_log.jsonl` の `INSPECTION` / `GUARD` / `NIGHT_ATTACK` イベントを集約 |

---

## 9. 将来計画

| Milestone | 対応 Issue | 主要変更 |
|---|---|---|
| M2 — アーカイブ連携 | #318 replay viewer | `parseGameData.js` 実装・`stub/spectator.js` 廃止 |
| M2 — ゲーム一覧動的化 | #312 GameData registry | `state_archive/` ディレクトリ一覧 fetch |
| M2 — ルーティング | （未 Issue） | react-router 導入・URL ベース遷移 |
| M3 — LIVE 観戦 | #319 LIVE spectator | WebSocket / SSE でリアルタイム更新 |
| M3 — FastAPI 連携 | #315 FastAPI + WebSocket | `src/ui/api.py` 追加・fetch 先を API に変更 |
| M4 — Next.js 移行 | — | React 資産を保持したまま SSR 対応 |
