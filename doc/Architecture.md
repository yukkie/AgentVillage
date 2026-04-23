# AgentVillage アーキテクチャ設計書

機能要件・ゲームルール・エージェント仕様は [Spec.md](Spec.md) を参照。
各モジュールの詳細設計は [DetailDesign.md](DetailDesign.md) を参照。

---

## 1. ディレクトリ構成

```text
AgentVillage/
├── .github/workflows/
│   └── ci.yml                  # Push/PR 時: ruff + pytest
├── doc/
│   ├── Architecture.md         # 本ドキュメント
│   ├── Spec.md                 # 仕様書
│   ├── Ideas.md                # アイデア・未決事項
│   └── Task.md                 # タスク管理
├── src/
│   ├── domain/                 # Pydanticドメインモデル定義（ゲーム仕様依存の型）+ Role クラス群
│   ├── engine/                 # ゲームエンジン（決定論的）
│   ├── agent/                  # エージェント状態・記憶・信念モデル
│   ├── llm/                    # LLMクライアント・プロンプト生成
│   ├── action/                 # 構造化アクション処理
│   ├── logger/                 # ログ保存・リプレイ
│   └── ui/                     # UIレイヤー（CLI / 将来Web）
├── state/
│   ├── world.json              # ゲーム全体の状態
│   ├── public_log.jsonl        # 公開ログ
│   └── agents/                 # エージェントごとの状態ファイル
│       ├── setsu.json
│       └── ...
├── tests/
│   ├── conftest.py
│   ├── unit/
│   ├── e2e/
│   ├── fixtures/
│   └── TestStrategy.md
└── requirements.txt
```

---

## 2. 設計方針

### 2.1 最重要原則：真実とLLMの分離

> **「ゲームの真実・ルール」と「LLMの会話・人格」を完全に分離する」**

- 役職・夜の結果・勝敗はシステム（Game Engine）が管理する
- LLMへのプロンプトには**公開情報のみ**渡す。真実はLLMに持たせない
- GMロジックは決定論的コードで実装し、LLMの出力に依存しない

### 2.2 UIレイヤーの薄さ

`src/ui/` はI/Oのみを担当し、ゲームロジックを持たない。
将来のWeb/モバイル対応時は `src/ui/` に新しいアダプターを追加するだけでよい。

```
CLI   →  src/ui/cli.py   ┐
Web   →  src/ui/api.py   ├─  src/engine/ / src/agent/ には依存しない
```

### 2.3 LLM出力は構造化して受け取る

LLMの出力は自然文のパースに頼らず、常にPydanticモデルで検証する。

---

## 3. コンポーネント設計

### 3.1 Game Engine（`src/engine/`）

- ゲームの進行・昼夜サイクルを管理する状態マシン
- 投票集計・勝敗判定・役職処理を決定論的に実装
- エージェントやLLMを直接呼ばない（依存逆転）
- `GameEngine` はオーケストレーターとして共通状態とユーティリティを保持し、前夜・昼・夜の具体的な進行は `phase_pre_night.py` / `phase_day.py` / `phase_night.py` に分離する
- 夜フェーズは「宣言」「優先度順の解決」「公表」を分離し、占いの副作用は解決時に即時反映しつつ、公表は生存判定後に行う

### 3.2 Agent State（`src/agent/`）

- エージェントの静的プロフィールと動的状態を管理
- 状態は `state/agents/{name}.json` に永続化
- Pydanticモデルは `src/domain/actor.py` で定義（`ActorProfile`, `ActorState`, `Belief`, `Persona`）
- ランタイムラッパー `Actor`（dataclass）は `profile: ActorProfile`, `state: ActorState`, `role: Role` を持つ

#### Persona フィールド

`Persona` モデルは `ActorProfile.persona` に保持され、以下のフィールドを持つ。

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `style` | `str` | — | 性格の文字列説明 |
| `lie_tendency` | `float` | `0.2` | 嘘のつきやすさ |
| `aggression` | `float` | `0.3` | 攻撃性 |
| `gender` | `str \| None` | `None` | 性別（`"male"` / `"female"` / `"non-binary"` 等、null = 未指定） |
| `age` | `str \| None` | `None` | 年齢または年代（例: `"17"`, `"teen"`, `"adult"`） |
| `speech_style` | `str` | `"casual"` | 口調（例: `"polite"`, `"casual"`, `"blunt"`, `"tsundere"`） |

これらは `build_persona_prompt()` でシステムプロンプトの一部に変換される。

#### claimed_role（公開役職）と intended_co（次発言のCO予定役職）

`ActorState` に以下のフィールドを持つ。

| フィールド | 内容 |
|---|---|
| `beliefs` | 他プレイヤーへの疑い・信頼・理由 |
| `memory_summary` | 今回のゲームで蓄積された中期記憶 |
| `is_alive` | 生存フラグ |
| `claimed_role` | エージェントが公言した役職（CO済みなら設定。未COはNull） |
| `intended_co` | 次の発言でCOする予定の役職。未予定なら `None`。前夜COでは真役職、議論中COでも同じフィールドを使う |

静的な `name`, `model`, `persona` は `ActorProfile` に分離される。真の役職は保存JSON上では `role` 文字列、ランタイムでは `Actor.role`（`Role` instance）として扱う。

- `intent.co` がLLM出力に含まれたタイミングでGame Engineが `claimed_role` に保存
- `claimed_role` は **Public情報** として全エージェントのプロンプトに渡す
- UIのカラー表示も `claimed_role` を参照（真の役職で色付けしない）

CO が成立する経路は現状2つある:

1. **前夜CO（Day 1 OPENING）**: `intended_co` に役職が設定されたエージェントが Day 1 OPENING で公言（§16.1）
2. **議論中CO（DISCUSSION・全Day）**: 判断フェーズで `decision="co"` を選んだ適格エージェントがその場で公言（§16.2）
   - 適格条件: `claimed_role is None` かつ `role != "Villager"`
   - 発言生成プロンプトは前夜CO経路と同じ「CO指示ブロック」を再利用する（`build_system_prompt` の `intended_co is not None` 分岐）
   - エンジンは判断結果を `AgentState.intended_co` に直接書き込み、発言後に clear する

なお Day 2+ OPENING には現状構造化された CO 判断ステップがなく、LLM が通常発言中に自発的に `intent.co` を返したケースのみ受動的に成立する。Day 2+ にも前夜判断相当のフェーズを設ける拡張案は Ideas.md §16.2a を参照。

#### COフォールバックと狂人の扱い

Day 1 OPENINGで `intended_co` が設定されているのにLLMがCOを出力しなかった場合のセーフティネット：

| 役職 | フォールバック内容 |
|---|---|
| Werewolf | `"Seer"` として強制CO（最も一般的な偽CO） |
| Seer / Knight / Medium | 自分の本当の役職名で強制CO |
| **Madman** | **強制しない**（LLMに委ねる） |

狂人が「Madman」と公言してしまうのを防ぐため、フォールバックから除外する。
狂人のCO先（Seer / Medium / Knightなどの偽CO、またはMadman公言）はLLMが状況判断で決める。
> **Madman公言の条件**: 人狼＋狂人の合計が生存者の過半数を超えている場合、狂人が自ら「狂人」とCOして人狼陣営の勝利を確定させる戦術がある。プロンプトでこの戦略ヒントを与える。

### 3.3 LLM Client（`src/llm/`）

- `anthropic` SDKのラッパー
- 性格プロンプト・役職プロンプトを組み合わせてエージェントごとのシステムプロンプトを生成
- LLMの出力をPydanticモデルで受け取る

#### 呼び出し種別

| 関数 | 用途 | プロンプト | 出力モデル |
|---|---|---|---|
| `call()` | 発言生成（OPENING / DISCUSSION） | フル（役職・性格・記憶・当日ログ・他者のCO情報・狼仲間（狼のみ）） | `AgentOutput` |
| `call_judgment()` | 判断（DISCUSSION 並列） | 軽量（役職・性格・memory_summary・直近発言のみ） | `JudgmentOutput` |
| `call_night_action()` | 夜行動 | 夜フェーズ専用 | `str`（ターゲット名） |
| `call_pre_night_action()` | 前夜判断・単体呼び出し | 役職・性格・参加者情報 | `PreNightOutput` |
| `call_pre_night_parallel()` | 前夜判断・並列呼び出し（`call_speech_parallel` と同パターン） | 同上 | `Iterator[tuple[Actor, PreNightOutput]]` |
| `call_discussion_parallel()` | 昼DISCUSSION 判断→発言チェーンの並列実行 | — | `Iterator[tuple[Actor, JudgmentOutput, AgentOutput \| None, SpeechEntry \| None]]` |

#### 並列実行

並列 LLM 実行の責任は **client.py が一元管理する**。`ThreadPoolExecutor` は game.py に書かない。

| 並列関数 | 用途 |
|---|---|
| `call_speech_parallel()` | DAY_OPENING — 全員発言を並列実行 |
| `call_pre_night_parallel()` | PRE_NIGHT — CO判断を並列実行 |
| `call_discussion_parallel()` | DAY_DISCUSSION — 判断→発言チェーンを並列実行 |

#### Extended thinking

占い師COへの反応・投票前詰め等、重要局面では `call()` に `extended_thinking=True` を渡せるようにする。
（MVP では任意フラグ。デフォルトはoff）

### 3.4 Action System（`src/action/`）

- LLMが提案した行動を検証し、ゲームエンジンに渡す
- 不正な行動（権限外のアクション等）はシステムが棄却

### 3.5 Logger（`src/logger/`）

- 公開ログ（`public_log.jsonl`）と観戦者ログ（真実込み）を分けて保存
- リプレイ機能の基盤

### 3.6 UI / CLI（`src/ui/`）

- Richを使ったカラー表示
- 表示内容の色分けは Spec.md §5 を参照
- `replay.py` — アーカイブ選択 UI とページャー。LLM を呼ばずに JSONL ログを再生する（Spec.md §6 参照）

各モジュールの詳細（ファイル一覧・個別責務）は [DetailDesign.md](DetailDesign.md) を参照。

---

## 4. 記憶設計

ログ全量をLLMに渡さない。記憶は3層に分ける。

| 層 | 内容 | MVPでの実装 |
|---|---|---|
| 長期記憶 | 性格・他エージェントの基本印象 | `persona` / `beliefs` フィールド |
| 中期記憶 | 今回のゲームの出来事 | `memory_summary` フィールド |
| 短期記憶 | 今日の議論・投票候補 | 当日の `public_log` をそのまま渡す |

---

## 5. 開発ワークフローとCI/CD

### 5.1 Branch Protection

- `master` への直接pushは禁止
- 全変更は `feature/xxx` / `fix/yyy` ブランチ → PR → CIパス → マージ

### 5.2 CI（GitHub Actions）

- **Ruff**: Lint & Format チェック
- **pytest**: 単体テスト・E2Eテスト（`-m "not remote_db"` で実DB除外）

### 5.3 開発手順

1. `git checkout -b feature/your-feature-name`
2. ローカルで `ruff check .` と `pytest` を実行
3. PR作成 → CIパス → マージ

---

## 6. ADR（アーキテクチャ上の意思決定記録）

### ADR-001: ゲームエンジンとLLMの完全分離

**状況**
LLMに役職や勝敗判定をさせると出力が非決定論的になり、ゲームの公平性が崩れる。

**決定**
ゲームの「真実」（役職・勝敗・夜の結果）はシステムが管理し、LLMには公開情報のみ渡す。

**理由**
ゲームの進行を確実にするため。LLMの役割は発言・推理・感情表現のみ。

**結果・トレードオフ**
ゲームの公平性と再現性が高まる。LLM側は「知らないことを知らない」状態で推理するためリアリティも増す。

---

### ADR-002: LLM出力のJSON構造化（Pydantic）

**状況**
LLMの自然文出力から投票先・COなどをパースするのは壊れやすい。

**決定**
LLMの出力はJSON形式で受け取り、Pydanticモデルで検証する。

**理由**
型安全にアクションを処理するため。パースエラーを早期に検出できる。

**結果・トレードオフ**
実装が安定する一方、プロンプトにJSON出力指示を含める必要がある。

---

### ADR-003: 状態管理にJSONファイルを使用（MVP）

**状況**
MVPではDB不要のシンプルな実装が望ましい。

**決定**
エージェント状態を `state/agents/*.json` で管理する。

**理由**
セットアップコストゼロ。状態ファイルを直接読めばデバッグも容易。

**検討した代替案**
SQLite、PostgreSQL。

**結果・トレードオフ**
マルチゲーム並行・ユーザー管理が必要になったタイミング（Web化時）でDBに移行する。

---

### ADR-004: 判断ターンの分離・並列実行・レスポンス順発言

**状況**
全エージェントが毎ターン発言するだけでは会話がモノローグの羅列になり、AIが自発的に反応する動的な議論が生まれない。

**決定**
昼フェーズに「判断ターン」を導入する。全エージェントに「challenge / speak / silent」の3択を並列で判断させ、発言意思があるエージェントだけ発言を生成する。発言順はAPIレスポンスが返ってきた順とする。

**実装方法**
- 各アクターに「`call_judgment()` → non-silent なら `build_speech_args()` → `call()`」をチェーンした callable を構成
- `call_discussion_parallel()` が `ThreadPoolExecutor` で全アクター分を並列実行（client.py 内）
- game.py はチェーン用の `build_speech_args` コールバックを渡し、並列実行自体は client.py に委譲する
- `as_completed()` でレスポンス順に post-processing（`today_log` 更新・イベント発行）を逐次実行
- 発言コンテキストはラウンド開始時のスナップショットを共有（同ラウンド内の他者発言は見えない）
- challenge 時は `reply_to`（speech_id）をスナップショット内で解決しプロンプトに含める

**理由**
- 判断プロンプトは軽量（memory_summary + 直近発言のみ）なので並列実行しても低コスト
- レスポンス順発言により「先に返ってきた反応が場の流れを作る」自然な会話ダイナミクスが生まれる
- challenge 時の speech_id 参照で、どの発言への反応かがログ上で追跡できる

**結果・トレードオフ**
発言順が実行ごとに変わる（非決定論的だが意図的）。全員silentのケースに備えてフォールバックが必要。
