# {ProjectName} — Claude 引き継ぎ資料

## プロジェクト概要
<!-- プロジェクトの目的・技術スタック・主要な外部サービスを記述 -->

詳細: [doc/Spec.md](doc/Spec.md) / [doc/Architecture.md](doc/Architecture.md)

---

## アーキテクチャの核心
<!-- 主要モジュールと責務を表形式で記述 -->

| 層/役割 | ファイル | 責務 |
|---|---|---|
|  | `src/` |  |

---

## 開発ルール

- `master` への直接 push は**禁止**。必ず `feature/xxx` ブランチ → PR → CI パス → マージ
- コミット前に `ruff check .` と `pytest` を実行（pre-commit でも自動実行）
- インポートは**絶対インポート** `from src.xxx` を使用（相対インポート不可）
- **実装前に必ず設計を説明する**: 変更ファイル・変更内容・設計上の判断ポイントを提示し、ユーザーの承認を得てから実装に入ること

詳細: [doc/Architecture.md](doc/Architecture.md)

---

## テスト方針の要点

- 純粋なロジック・データ変換処理 → 単体テスト対象
- 外部サービス連携・UI層 → 単体テスト対象外（E2E でカバー）
- CI では `-m "not remote_db"` で実DB接続テストを除外

詳細: [tests/TestStrategy.md](tests/TestStrategy.md)

---

## 実装上の注意点（落とし穴）
<!-- プロジェクト固有のハマりポイントをここに追記 -->

---

## タスク・進捗管理

[doc/Task.md](doc/Task.md)
