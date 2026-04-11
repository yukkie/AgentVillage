# AgentVillage — Claude 引き継ぎ資料

## プロジェクト概要

LLMエージェント同士が自律的に人狼ゲームをプレイする「社会シミュレーションゲーム」。
プレイヤーはAIたちの社会を観察・間接介入する観戦型ゲーム。

- 言語: Python
- LLM: Claude API（`anthropic` SDK）
- エージェント状態: JSONファイル（`state/agents/*.json`）

アイデア詳細: [doc/Ideas.md](doc/Ideas.md) / 詳細仕様: [doc/Spec.md](doc/Spec.md) / [doc/Architecture.md](doc/Architecture.md)

---

## アーキテクチャの核心

最重要原則: **「ゲームの真実・ルール」と「LLMの会話・人格」を完全に分離する」**

| 層/役割 | ファイル | 責務 |
|---|---|---|
| Game Engine (GM) | `src/engine/` | ルール・役職・投票・勝敗・昼夜管理（決定論的コード） |
| Agent State | `src/agent/` | 記憶・疑い・信頼・性格モデル |
| LLM Client | `src/llm/` | 発言生成・思考・行動提案の委譲 |
| Action System | `src/action/` | 投票・CO・夜行動の構造化アクション処理 |
| Logger | `src/logger/` | ログ保存・リプレイ |
| Player Interface | `src/ui/` | 観戦・介入UI |

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

- **LLMに真実を持たせない**: 役職・夜の結果はシステムが管理。LLMへのプロンプトには公開情報のみ渡す
- **GMロジックは決定論的に**: 投票集計・勝敗判定は乱数や曖昧さを排除し、コードで確定させる
- **LLM出力は必ずJSONで受け取る**: `speech`・`thought`・`intent`・`memory_update` を構造化。自然文のパースに頼らない
- **思考と発言は別フィールド**: `thought`（腹の中）と `speech`（表の言葉）を分離して管理する

---

## 開発フロー

1. **アイデア投入**: ユーザーがチャットでアイデア・要求を伝える。Claudeが [doc/Ideas.md](doc/Ideas.md) に記録・整理する
2. **ドキュメントへ振り分け**: Claudeが内容を解釈し、以下に反映する
   - [doc/Spec.md](doc/Spec.md) — **何を作るか**（ゲームルール・機能要件・ユーザー体験）
   - [doc/Architecture.md](doc/Architecture.md) — **どう作るか**（コンポーネント設計・データ構造・インターフェース）
   - [doc/DetailDesign.md](doc/DetailDesign.md) — **どう実装するか**（モジュール・クラス・インターフェース詳細）
3. **設計説明と承認**: 実装前に変更ファイル・内容・判断ポイントを提示し、ユーザーの承認を得る
4. **ドキュメントレビュー（必須）**: 承認を得たら、コードを書く前に上記3ファイルが今回の変更を反映した最新状態になっているか確認する。未反映の箇所があれば先にドキュメントを更新する
5. **実装**: ドキュメント確認後にコードを書く

---

## タスク・進捗管理

[doc/Task.md](doc/Task.md)
