# AgentVillage 詳細設計書

各コンポーネントの概要は [Architecture.md](Architecture.md) を参照。

---

## src/engine/ — ゲームエンジン（決定論的）

ゲームの「真実」を管理する唯一の場所。LLMを呼ばない。

| モジュール | 責務 |
|---|---|
| `game.py` | ゲーム全体の状態マシン。昼夜ループを回す |
| `phase.py` | フェーズ定義（昼/夜/開始/終了）と遷移ロジック |
| `role.py` | 役職定義（村人・人狼・占い師）と夜行動の処理 |
| `vote.py` | 投票集計・同数処理・追放決定 |
| `victory.py` | 勝利条件の判定 |

---

## src/agent/ — エージェント状態・記憶・信念

エージェントの「内部状態」を管理。LLMを呼ばない。

| モジュール | 責務 |
|---|---|
| `state.py` | Pydanticモデル定義（`AgentState`, `Beliefs`, `Persona`） |
| `memory.py` | 短期・中期・長期記憶の更新ロジック |
| `belief.py` | 疑い・信頼スコアの更新（`memory_update` を受けて反映） |
| `store.py` | JSONファイルへのread/write |

### エージェント状態JSONスキーマ例

```json
{
  "name": "Setsu",
  "role": "Villager",
  "persona": {
    "style": "logical, calm, empathic",
    "lie_tendency": 0.1,
    "aggression": 0.2,
    "gender": "female",
    "age": "adult",
    "speech_style": "polite"
  },
  "beliefs": {
    "SQ": { "suspicion": 0.62, "trust": 0.18, "reason": ["Day2で票替え"] }
  },
  "claims": { "self_co": null, "others": {} },
  "memory_summary": ["Day1: SQはジナを擁護"],
  "goal": "survive and eliminate werewolves",
  "last_action": { "type": "vote", "target": "SQ" }
}
```

---

## src/llm/ — LLMクライアント・プロンプト生成

唯一 anthropic SDK を触る場所。

| モジュール | 責務 |
|---|---|
| `client.py` | anthropic SDKのラッパー。APIコールと `AgentOutput` へのパース |
| `prompt.py` | 性格プロンプト・役職プロンプトを組み合わせてシステムプロンプトを生成 |
| `schema.py` | `AgentOutput` のPydanticモデル定義（`thought`, `speech`, `intent`, `memory_update`） |

### AgentOutput スキーマ

```python
class AgentOutput(BaseModel):
    thought: str
    speech: str
    intent: Intent
    memory_update: list[str]
```

---

## src/action/ — 構造化アクション処理

LLMの提案をゲームエンジンに渡す橋渡し役。

| モジュール | 責務 |
|---|---|
| `types.py` | アクション型定義（`Vote`, `CO`, `Accuse`, `Inspect`, `Attack` ...） |
| `validator.py` | LLMの提案が現在のフェーズ・権限で有効か検証 |
| `resolver.py` | 有効なアクションをengineに渡して実行 |

---

## src/logger/ — ログ保存・リプレイ

| モジュール | 責務 |
|---|---|
| `event.py` | ログイベントの型定義（発言・投票・死亡・夜行動など） |
| `writer.py` | `public_log.jsonl`（全員公開）と `spectator_log.jsonl`（真実込み）への書き込み |
| `replay.py` | ログを読んで再生する（将来のリプレイUI用） |

---

## src/ui/ — UIレイヤー

| モジュール | 責務 |
|---|---|
| `cli.py` | Richを使ったCLI表示。フェーズ区切り・発言・死亡通知を色付きで出力 |
| `renderer.py` | イベントを受け取って表示文字列に変換（cliから切り離して将来のWeb対応を容易に） |
