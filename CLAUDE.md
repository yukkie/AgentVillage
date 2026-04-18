# AgentVillage — Claude 引き継ぎ資料

## プロジェクト概要

LLMエージェント同士が自律的に人狼ゲームをプレイする「社会シミュレーションゲーム」。
プレイヤーはAIたちの社会を観察・間接介入する観戦型ゲーム。

- 言語: Python
- LLM: Claude API（`anthropic` SDK）
- エージェント状態: JSONファイル（`state/agents/*.json`）

| ドキュメント | 内容 |
|---|---|
| [doc/Ideas.md](doc/Ideas.md) | アイデア・未決事項 |
| [doc/Spec.md](doc/Spec.md) | 何を作るか（ゲームルール・機能要件） |
| [doc/Architecture.md](doc/Architecture.md) | どう作るか（設計方針・ADR・コンポーネント） |
| [doc/DetailDesign.md](doc/DetailDesign.md) | どう実装するか（モジュール・クラス詳細） |
| [doc/Task.md](doc/Task.md) | タスク・進捗管理 |
| [tests/TestStrategy.md](tests/TestStrategy.md) | テスト方針 |

---

## 開発ルール

- `master` への直接 push は**禁止**。必ず `feature/xxx` ブランチ → PR → CI パス → マージ
- コミット前に `ruff check .` と `pytest` を実行（pre-commit でも自動実行）
- インポートは**絶対インポート** `from src.xxx` を使用（相対インポート不可）
- **実装前に必ず設計を説明する**: 変更ファイル・変更内容・設計上の判断ポイントを提示し、ユーザーの承認を得てから実装に入ること
- 開発フロー詳細（アイデア→Issue→実装→PR）は `/idd` スキル（`~/.claude/skills/idd/SKILL.md`）を参照

---

## 会話・レビュー時の振る舞い

- **質問には先に回答する**: レビューや確認の質問を受けたとき、コードを修正する前に必ず口頭で回答する。その後、誤りに気づいた場合は理由を示してから修正案を提示する
