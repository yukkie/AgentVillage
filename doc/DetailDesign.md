# AgentVillage 詳細設計書

各コンポーネントの概要は [Architecture.md](Architecture.md) を参照。

---

## src/engine/ — ゲームエンジン（決定論的）

ゲームの「真実」を管理する唯一の場所。LLMを呼ばない。

| モジュール | 責務 |
|---|---|
| `game.py` | ゲーム全体の状態マシン。昼夜ループを回す |
| `phase.py` | フェーズ定義（昼/夜/開始/終了）と遷移ロジック |
| `role.py` | 役職定義と夜行動マッピング（`ROLE_NIGHT_ACTIONS`） |
| `vote.py` | 投票集計・同数処理・追放決定 |
| `victory.py` | 勝利条件の判定 |

#### role.py — 役職定義

`ROLE_NIGHT_ACTIONS` で各役職の夜行動を定義する。夜行動が「ない」役職は `None`。

| 役職 | ROLE_NIGHT_ACTIONS | 備考 |
|---|---|---|
| Villager | `None` | |
| Seer | `"inspect"` | 対象を選んで占う |
| Knight | `"guard"` | 対象を選んで護衛する |
| Werewolf | `"attack"` | 対象を選んで襲撃する |
| Medium | `None` | 昼処刑後にGMから結果が届く（受動的）。夜に対象を選ばない |
| Madman | `None` | 人狼陣営だが夜行動なし。狼チャットにも参加しない |

#### game.py — 霊媒師への処刑結果通知

`_run_day` 内の `_eliminate` 呼び出し直後に以下を実行する：

```
処刑発生
  └─ _eliminate(X) → X.is_alive = False
  └─ _alive_agents() で Medium を探す（X自身が処刑された場合は見つからないので安全）
       └─ Medium が生存中の場合:
            memory_mod.update_memory(medium, ["Day N: X was executed, role was Y"])
            LogEvent(MEDIUM_RESULT, is_public=False)  # 観戦者のみ表示（黄色）
```

霊媒師が夜に襲撃された場合は昼フェーズで通知済みのため問題なし。
処刑が発生しなかった日（同票など）はスキップ。

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

### LLM呼び出し関数と max_tokens 設定

| 関数 | 用途 | max_tokens | 理由 |
|---|---|---|---|
| `call()` | 昼フェーズの発言生成（OPENING / DISCUSSION） | 2048 | thought が日本語で長くなりやすい |
| `call_judgment()` | 昼フェーズの並列判断（challenge / speak / silent / co） | 1024 | JSON 2フィールドのみだが日本語思考が付随することがある。`co_eligible=True` のときのみ `"co"` を選択肢に含める |
| `call_wolf_chat()` | 夜フェーズの狼チーム会話 | 2048 | thought + speech + vote_candidates。日本語で長くなりやすい |
| `call_pre_night_action()` | 前夜フェーズの CO 判断（占い師・人狼） | 1024 | thought + decision + reasoning の3フィールド |
| `call_night_action()` | 夜フェーズの個別行動（襲撃・占い・護衛） | 64 | プレイヤー名1つだけ返す |

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

#### event.py — EventType 一覧

| EventType | is_public | 説明 |
|---|---|---|
| `SPEECH` | True | エージェントの発言 |
| `VOTE` | True | 投票行動 |
| `ELIMINATION` | True | 昼の処刑 |
| `NIGHT_ATTACK` | False | 狼の夜襲（観戦者のみ） |
| `INSPECTION` | False | 占い師の占い結果（観戦者のみ） |
| `MEDIUM_RESULT` | False | 霊媒師が受け取った処刑者の役職（観戦者のみ・黄色表示） |
| `GUARD` | False | 騎士の護衛行動（観戦者のみ） |
| `GUARD_BLOCK` | False / True | 護衛成功の詳細（観戦者）/ 全体通知（村人全員） |
| `WOLF_CHAT` | False | 狼チャット（観戦者のみ） |
| `PRE_NIGHT_DECISION` | False | 前夜CO判断（観戦者のみ） |
| `PHASE_START` | True / False | フェーズ開始通知 |
| `GAME_OVER` | True | ゲーム終了 |

---

## src/ui/ — UIレイヤー

| モジュール | 責務 |
|---|---|
| `cli.py` | Richを使ったCLI表示。フェーズ区切り・発言・死亡通知を色付きで出力 |
| `renderer.py` | イベントを受け取って表示文字列に変換（cliから切り離して将来のWeb対応を容易に） |
