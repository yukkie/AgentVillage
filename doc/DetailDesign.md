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

## src/domain/ — Pydanticドメインモデル

ゲーム仕様依存の型定義を集約。LLMもIOロジックも持たない。

| モジュール | 責務 |
|---|---|
| `agent.py` | `AgentState`, `Belief`, `Persona` のPydanticモデル定義 |
| `event.py` | `EventType`, `LogEvent` のPydanticモデル定義 |
| `schema.py` | `AgentOutput`, `SpeechEntry`, `JudgmentOutput` 等のPydanticモデル定義 |

---

## src/agent/ — エージェント状態・記憶・信念

エージェントの「内部状態」を管理。LLMを呼ばない。

| モジュール | 責務 |
|---|---|
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
| `prompt.py` | 性格プロンプト・役職プロンプトを組み合わせてシステムプロンプトを生成。`build_system_prompt(agent, ctx, direction, role_ctx)` の4引数シグネチャ。公開情報は `PublicContext`、発言制御は `SpeechDirection`、役職固有情報は `RoleSpecificContext` サブクラス（現在は `WolfSpecificContext` のみ）で渡す |

Pydanticモデル（`AgentOutput`, `SpeechEntry` 等）は `src/domain/schema.py` に移動。

### prompt.py — コンテキスト dataclass

```python
@dataclass
class PublicContext:
    today_log: list[SpeechEntry]   # 今日の発言ログ
    alive_players: list[str]
    dead_players: list[str]
    day: int
    all_agents: list[AgentState] | None = None   # 役職分布・CO状況
    past_votes: list[dict] | None = None
    past_deaths: list[dict] | None = None

@dataclass
class SpeechDirection:
    lang: str = "English"
    reply_to_entry: SpeechEntry | None = None   # challenge 対象
    intended_co: bool = False

@dataclass
class RoleSpecificContext:
    """役職固有コンテキストの基底クラス"""
    pass

@dataclass
class WolfSpecificContext(RoleSpecificContext):
    wolf_partners: list[str]   # 生存中の仲間狼の名前リスト
```

- `PublicContext` は1フェーズ内で全エージェント共通のため1回構築して使い回せる
- `SpeechDirection` はエージェントごとに異なる（reply_to, co フラグ）
- `RoleSpecificContext` サブクラスは役職固有のランタイム情報を型安全に渡す手段。Seer/Knight/Medium 向けサブクラスは Issue #36 実装時に追加予定

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
| `logger.py` | 共通定数（`STATE_DIR`, `PUBLIC_LOG`, `SPECTATOR_LOG`, `ARCHIVE_DIR`）を一元管理。writer/reader が参照する |
| `writer.py` | `public_log.jsonl`（全員公開）と `spectator_log.jsonl`（真実込み）への書き込み。定数は `logger.py` から import |
| `reader.py` | `load_events(path: Path) -> list[LogEvent]` — JSONL ログの読み込みユーティリティ。GUI・リプレイ・将来の外部ツールが共通利用する |
| `replay.py` | ログを読んで再生する（将来のリプレイUI用） |

`EventType`, `LogEvent` のPydanticモデルは `src/domain/event.py` に移動。

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
| `CO_ANNOUNCEMENT` | True | 役職公言。`claimed_role` フィールドに公言した役職名を格納 |
| `PHASE_START` | True / False | フェーズ開始通知 |
| `GAME_OVER` | True | ゲーム終了 |

#### event.py — LogEvent フィールド

`CO_ANNOUNCEMENT` イベントには `claimed_role: str | None` フィールドを使う。
`content` の文字列フォーマット（`"{name} claims to be {role}"`）に依存せず、型安全に公言役職名を参照できる。
既存アーカイブとの後方互換は `default=None` で対応する。

---

## src/ui/ — UIレイヤー

| モジュール | 責務 |
|---|---|
| `cli.py` | Richを使ったCLI表示。フェーズ区切り・発言・死亡通知を色付きで出力 |
| `renderer.py` | イベントを受け取って表示文字列に変換（cliから切り離して将来のWeb対応を容易に） |
| `replay.py` | アーカイブ選択UI + ページャー。LLMを一切呼ばずにJSONLログを再生する |

### replay.py — クラス構成

#### `run_replay(spectator_mode: bool, archive_path: Path | None = None)`

エントリポイント関数。`archive_path` が未指定の場合は `ArchiveSelector` でユーザーに選ばせる。

#### `ArchiveSelector`

```python
class ArchiveSelector:
    def __init__(self, archive_dir: Path)
    def select(self) -> Path | None
```

- `state_archive/` 内フォルダを新しい順にリスト
- msvcrt（Windows）でキー入力を受け取り、上下移動・ENTER 選択・Q/ESC キャンセル
- フォルダ 0 件のときは `None` を返す

#### `ReplayPager`

```python
class ReplayPager:
    def __init__(self, archive_path: Path, spectator_mode: bool)
    def run(self)
```

**初期化:**
1. `archive_path/agents/*.json` を `AgentState` としてロード（`src.agent.state` の Pydantic モデルを直接使用）
2. `spectator_mode` に応じて `spectator_log.jsonl` または `public_log.jsonl` を読み込み
3. 各 `LogEvent` を `renderer.render_event()` で描画し、`list[str]`（ANSI 文字列）としてバッファに積む

**`_build_lines()` の claimed_role 動的追跡:**
アーカイブの agent JSON は end-of-game 状態（CO済み）を持つ。そのまま使うと、CO前の発言もCO後の色で表示されてしまう。
これを防ぐため、`_build_lines()` ではエージェントのコピーを作り `claimed_role` を全員 `None` にリセットした上で、
イベントを順に処理しながら `CO_ANNOUNCEMENT` が来たタイミングで `claimed_role` を更新する。
spectatorモードは `agent.role`（変化しない真の役職）を使うため影響なし。

**ページャーループ:**
- `shutil.get_terminal_size().lines` でターミナル高さを取得
- 1 ページ = `terminal_height - 2` 行
- 現在位置 `pos`（行インデックス）を管理し、キー入力に応じて更新
- 画面下部にステータスバー: `(Line X-Y / total)`

**キー入力:**
- Windows: `msvcrt.getch()` を使用（`\xe0` + 方向コードで矢印キーを判定）
