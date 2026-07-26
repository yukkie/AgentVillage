# GameData — データギャップ管理

Issue #312 の責務：Milestone 1/2 実装中に発覚した「実ログにないフィールド」「フロントエンドが必要だが Python 側が未出力のデータ」を記録し、対応方針を追跡する。

解決済み（実データ化された／UI ごと削除された）項目は本ファイルから削除する。
「いつ何が解決したか」は git 履歴と各 Issue（#337 / #519 / #522 / #524 / #541 など）を正本とする。

---

## 未解決のデータギャップ

実ログ（`spectator_log.jsonl` / `state_archive/` / `agents/*.json`）に存在しないフィールド。

| フィールド | 用途 | 現状 | 対応方針 |
|---|---|---|---|
| `village_name` | ゲームカードのタイトル | ❌ ログに存在しない | ❌ スタブ固定（`session_id` で代替）。Milestone 3（FastAPI / DB 導入後）に再検討 |
| `rule` | ゲームカードのルール表示 | ❌ ログに存在しない | ❌ スタブ固定（`'—'` で代替）。同上 |
| `desc` | ゲームカードの1行説明 | ❌ ログに存在しない | ❌ スタブ固定（空文字で代替）。同上 |
| `live` | 進行中フラグ（LIVE表示・「🔴 LIVE」タブのフィルター条件） | ❌ ログに存在しない（完了済みアーカイブのみ） | ❌ スタブ固定（`false` で代替）。#319 LIVE観戦実装時に対応 |

### 決着済み: 信頼（trust）スコアは採らない

疑い度（`suspicion`）は SpectatorScreen / AgentDetailScreen とも実データ化済み（#523 AC-5。`agents/*.json` の `state.beliefs[].suspicion` / `suspicion_update.suspicion_snapshot` 由来）。

一方 **信頼（trust）スコアはギャップではなく「採らない」決定済み**:
- Python 側の `Belief` に `trust` フィールドは存在せず、`tests/unit/test_prompt.py::test_belief_has_no_trust_field` が不在を仕様として固定している
- モックにあった疑い度マトリクスの trust バーは #523 AC-7 で撤去済み（dual-bar → suspicion 単一バー）
- `AgentDetailScreen.test.jsx` の `game-scoped does not create real trust data from agent json` が再発を防いでいる

> ⚠️ `doc/DetailDesign.md:149` の belief 例に残る `"trust": 0.18` は実装と食い違う古い記載。

---

## 残存スタブ UI

データギャップではなく「機能・仕様が未実装のまま置かれている UI 要素」。
画面を見ながら「実装する / 削除する」を確定させる対象。

### SpectatorScreen

| UI要素 | 実装箇所 | 現状 | 対応方針 |
|---|---|---|---|
| REPLAY / LIVE バッジ | `SpectatorScreen.jsx:426` | `REPLAY` ハードコード。LIVE時の切り替えなし | #319 LIVE観戦実装時に対応 |
| 同時観戦 142 | `SpectatorScreen.jsx:427` | ハードコード数値 | 仕様未定（ソーシャル機能） |
| ⤓ 全ログDL | `SpectatorScreen.jsx:431` | アクションなしのダミーボタン | 仕様未定 |
| ★ 応援 | `SpectatorScreen.jsx:432` | アクションなしのダミーボタン | 仕様未定（ソーシャル機能） |
| ⇅ 新しい順 | `SpectatorScreen.jsx:446` | アクションなしのダミーボタン（ソートなし） | 仕様未定 |
| 🔍 検索 | `SpectatorScreen.jsx:447` | アクションなしのダミーボタン | 仕様未定 |

### GameListScreen

| UI要素 | 実装箇所 | 現状 | 対応方針 |
|---|---|---|---|
| 👁 同時観戦数 | `GameListScreen.jsx:154` / `archiveLoader.js:44` | `viewers: 0` 固定（完了ゲームは `'—'` 表示） | #319 LIVE観戦実装時に対応 |
| LIVE 緊迫バナー | `GameListScreen.jsx:282-285` | 「第13回『桜霞』」「Ren と Nox の対抗占い」等が完全ハードコード | #319 LIVE観戦実装時に対応 |
| 🔴 LIVE タブ | `GameListScreen.jsx:101` | `g.live === true` のゲームのみ表示。live データ未供給のため常に0件 | #319 で live データが供給されれば即機能する設計 |

> 左ナビ「ルール」セクション（フィルター未実装・`roles.json` と不整合）は **#623**、
> 新しい村を作るフォーム（起動連携なし）は **#624** で起票済みのため本表から除外。

---

## 凡例

- **現状**: 実ログ（`spectator_log.jsonl` / `state_archive/`）およびフロントエンド実装における現在の状態
- **対応方針**: 実データ接続・仕様確定時に取るべきアクション
