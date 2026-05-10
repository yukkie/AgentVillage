# GameData — データギャップ管理

Issue #312 の責務：Milestone 1/2 実装中に発覚した「実ログにないフィールド」「フロントエンドが必要だが Python 側が未出力のデータ」を記録し、対応方針を追跡する。

---

## ギャップ一覧

| # | フィールド | 発見Issue | 現状 | 対応方針 |
|---|---|---|---|---|
| G-1 | `thought` | #309 | `public_log.jsonl` に含まれない（Python 側は非公開扱い） | spectator モード専用フィールドとして別途 `spectator_log.jsonl` に出力するか、フロントエンド側で非表示フラグで制御する（#312 で決定） |
| G-2 | `claimed_role` | #309 | `public_log.jsonl` に `claimed_role` フィールドが存在するが、CO 発言時に正しくセットされているか未確認 | #305 修正後に実ログで確認する |

---

## 凡例

- **発見Issue**: このギャップを発見した実装 Issue
- **現状**: 実ログ（`public_log.jsonl` / `state_archive/`）における現在の状態
- **対応方針**: Milestone 2 以降の実データ接続時に取るべきアクション
