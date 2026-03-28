# AgentVillage

LLMエージェントが自律的に人狼ゲームをプレイする社会シミュレーション。
プレイヤーはAIたちの推理・嘘・説得を観察する観戦型ゲーム。

---

## 特徴

- **観戦型ゲーム** — AIたちの会話・推理・裏切りをリアルタイムで観察
- **思考と発言の分離** — 各エージェントは腹の中の思考と表の発言を別々に持つ（人狼BBSの灰ログ文化にインスパイア）
- **決定論的なゲームエンジン** — 役職・投票・勝敗はコードが管理。LLMは発言と推理のみを担当
- **多言語対応** — `--lang Japanese` で日本語プレイ

## セットアップ

**必要なもの:** Python 3.12+ / [uv](https://docs.astral.sh/uv/) / Anthropic API key

```bash
# uv をインストール（未インストールの場合）
curl -LsSf https://astral.sh/uv/install.sh | sh

git clone https://github.com/yourname/AgentVillage.git
cd AgentVillage
uv sync

cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定
```

## 使い方

```bash
uv run main.py                          # 通常観戦モード
uv run main.py --spectator              # 思考・夜行動も表示
uv run main.py --lang Japanese          # 日本語でプレイ
uv run main.py --spectator --lang Japanese
```

| オプション | 説明 |
|---|---|
| `--spectator` | エージェントの思考・夜の行動も表示 |
| `--lang <言語>` | 発言・推理の言語（例: `Japanese`, `English`）デフォルト: `English` |

## ゲームルール

| 項目 | 内容 |
|---|---|
| プレイヤー | 5エージェント（役職はランダム割り当て） |
| 役職 | 村人×3 / 占い師×1 / 人狼×1 |
| 昼フェーズ | 発言 → 推理宣言 → 投票 → 追放 |
| 夜フェーズ | 人狼が1名を襲撃 / 占い師が1名を占う |
| 村人勝利 | 人狼を全員追放 |
| 人狼勝利 | 人狼数 ≥ 村人数 |

## アーキテクチャ

```
src/
├── engine/    # ゲームエンジン（決定論的）
├── agent/     # エージェント状態・記憶・信念モデル
├── llm/       # LLMクライアント・プロンプト生成
├── action/    # 構造化アクション処理
├── logger/    # ログ保存
└── ui/        # Rich CLIレンダラー
```

最重要原則: **ゲームの真実（役職・夜の結果）はシステムが管理。LLMには公開情報のみ渡す。**

詳細は [doc/Architecture.md](doc/Architecture.md) を参照。

## 開発

```bash
uv run ruff check .
uv run pytest
```

`feature/xxx` ブランチ → PR → CI → `master` マージ（`master` への直接 push 禁止）

---

# AgentVillage (English)

A social simulation where LLM agents autonomously play Werewolf. Players observe the AI society — watching agents reason, lie, and persuade each other.

## Features

- **Spectator-style game** — Watch AI agents discuss, deduce, and betray in real time
- **Thought vs. speech separation** — Each agent has private inner thoughts and public speech (inspired by werewolf BBS "gray log" culture)
- **Deterministic game engine** — Roles, voting, and win conditions are managed by code. LLMs handle only speech and reasoning
- **Multilingual** — Play in any language with `--lang Japanese`

## Setup

**Requirements:** Python 3.12+ / [uv](https://docs.astral.sh/uv/) / Anthropic API key

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

git clone https://github.com/yourname/AgentVillage.git
cd AgentVillage
uv sync

cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY
```

## Usage

```bash
uv run main.py                          # Public spectator mode
uv run main.py --spectator              # Show thoughts & night actions
uv run main.py --lang Japanese          # Play in Japanese
uv run main.py --spectator --lang Japanese
```

| Option | Description |
|---|---|
| `--spectator` | Show agent thoughts and night actions |
| `--lang <language>` | Language for agent speech and reasoning (e.g. `Japanese`, `English`). Default: `English` |

## Game Rules

| Item | Detail |
|---|---|
| Players | 5 agents (roles randomly assigned each game) |
| Roles | Villager×3 / Seer×1 / Werewolf×1 |
| Day phase | Speech → Reasoning → Vote → Elimination |
| Night phase | Werewolf attacks / Seer inspects |
| Villagers win | All werewolves eliminated |
| Werewolves win | Werewolf count ≥ villager count |

## Architecture

```
src/
├── engine/    # Game engine (deterministic)
├── agent/     # Agent state, memory, belief model
├── llm/       # LLM client, prompt builder
├── action/    # Structured action processing
├── logger/    # Log persistence
└── ui/        # Rich CLI renderer
```

Core principle: **The system holds the truth (roles, night results). LLMs only receive public information.**

See [doc/Architecture.md](doc/Architecture.md) for details.

## Development

```bash
uv run ruff check .
uv run pytest
```

Branch strategy: `feature/xxx` → PR → CI → merge to `master` (direct push to `master` is forbidden)

## License

MIT
