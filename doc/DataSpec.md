# DataSpec — データ契約の単一の真実の源（SSOT）

UI・CLI・バックエンド実装に依存しない**データ契約**を集約するドキュメント。
フロントエンド／CLI renderer／リプレイ／外部ツールなど、`spectator_log.jsonl` や
エージェント JSON を読むすべての consumer は、まずこの文書を参照する。

> **正本は実コード**: スキーマの最終的な正本は `src/domain/event.py`（`LogEvent` / `EventType`）と
> `src/domain/actor.py`（`ActorProfile` / `ActorState` / `Persona`）である。
> 本書はそれを人間可読にまとめたもので、両者が食い違った場合は**実コードを正**とする。
>
> 表示制御の設計判断（なぜ3軸なのか）は [Architecture.md §2.4](Architecture.md) / ADR-005 を参照。

---

## 1. EventType 一覧

`spectator_log.jsonl` に1行1イベントで記録される `event_type` の全種別。
**現行イベント**（エンジンが emit する）と、**後方互換イベント**（旧アーカイブの
replay 用に read 側だけが解釈する。新規 emit はしない）の2層に分かれる。

### 1.1 現行イベント（emit される）

| event_type | is_public 既定 | reasoning | spectator_content | 概要 |
|---|---|---|---|---|
| `speech` | true | ✅ 思考 | — | 昼の発言。`claimed_role` 付きなら CO を兼ねる |
| `wolf_chat` | false | ✅ 思考 | — | 夜の狼チーム会話 |
| `vote` | true | ✅ 理由 | — | 投票 |
| `inspection` | false | ✅ 理由 | — | 占い結果 |
| `guard` | false | ✅ 理由 | — | 騎士の護衛 |
| `guard_block` | — | — | ✅ 文面択一 | 護衛成功の通知（観戦者は守護者を明示、公開版は伏せる） |
| `night_attack` | 通知=true / 実行=false | ✅ 理由 | — | 狼の襲撃 |
| `elimination` | true | — | — | 昼の処刑・死亡 |
| `medium_result` | false | — | — | 霊媒結果（観戦者のみ・黄色表示） |
| `suspicion_update` | false | — | — | 村人視点の疑念スコア更新（観戦者のみ） |
| `threat_update` | false | — | — | 人狼視点の脅威スコア更新（観戦者のみ） |
| `game_over` | true | — | — | ゲーム終了。`winner` フィールドに勝者陣営を設定する（`"Villagers"` / `"Werewolves"`）。`day` は最終ゲーム日 + 1（`Phase.GAME_OVER` 専用フェーズとして扱うため、最終日とは別の day 値を持つ） |
| `phase_start` | true | — | — | フェーズ開始マーカー |

### 1.2 後方互換イベント（read のみ・新規 emit しない）

旧アーカイブの replay を壊さないために read 側（CLI renderer / JS parser）だけが
解釈する。新規ログには出力されない。

| event_type | 旧用途 | 現在の置き換え先 |
|---|---|---|
| `judgment` | 昼DISCUSSION 判断フェーズの行動選択（`decision` を表示） | 廃止（現行エンジンは emit しない。renderer が read 互換で残す） |
| `co_announcement` | 役職公言を別イベントとして emit | `speech` の `claimed_role` フィールド |
| `pre_night_decision` | 夜前の CO 判断イベント | 廃止（DISCUSSION の `co` ツールに統合） |

> **後方互換**: 旧ログには CO が `co_announcement` 別行、思考が `[THINK]` プレフィックス付きの
> 非公開行として記録されている。emit 側は新スキーマのみを出力するが、read 側は旧形式を
> 解釈できる**読み取りフォールバック**を残す。
> 詳細は [Architecture.md §2.4](Architecture.md) の後方互換ノートを参照。

> **整理済み（#431）**: かつて drift していた3イベントを以下のとおり確定した。
> - `vote_candidates`: 過去 emit され（#219）後に `suspicion_update` へ置換（#36）。旧アーカイブの
>   146 行はワンショット移行で `suspicion_update` に書き換え済み（`event_type` のみ変更・`content` は据え置き）。
>   enum・renderer に分岐は追加しない。
> - `reasoning`（旧 `REASONING` enum）: 過去ログに1行も存在せず emit もされないデッドコードのため、
>   enum と renderer 分岐を削除した。
> - `judgment`: 過去ログに実在する後方互換 read 専用イベント。上表のとおり維持する。

---

## 2. 表示制御の3軸

`LogEvent` の公開/非公開・viewerMode 制御は**直交する3つの軸**で表現する。
これらを混同しないことが設計の要点である（設計判断の詳細は
[Architecture.md §2.4](Architecture.md) / ADR-005）。

| 軸 | フィールド | 意味 |
|---|---|---|
| **イベント全体の公開可否** | `is_public` | `false` のイベントは public モードで非表示。イベント単位の on/off（vote 内訳・wolf_chat・inspection 等） |
| **viewerMode 別の文面択一** | `content` / `spectator_content` | 同一イベントを viewerMode で**文面切替**する。「非表示」ではなく「択一」。`spectator_content` が空なら両モードとも `content` を使う（guard_block 等） |
| **思考の付帯情報** | `reasoning` | `content` とは独立した、**常に spectator 限定**の思考・理由。`is_public` とは無関係に spectator のみ表示 |

加えて `claimed_role`（CO 情報）は `speech` イベントに付随させ、別イベント化しない。
CO の告知文は consumer 側が `claimed_role` の状態遷移から生成する。
つまり、同一エージェントについて表示済みの `claimed_role` と `speech.claimed_role` が異なる場合、
その `speech` を CO 宣言として補助表示してよい。これは観客向けの表示補助であり、
`decision="co"` の文字列フラグを CO 表示の正本にはしない。
現行 producer は CO 済みエージェントの後続 `speech` にも現在の `claimed_role` を付与するため、
`speech.claimed_role != null` かつ `decision == ""` は正常な後続発言として発生する。

---

## 3. spectator / public 可視性ルール

### 3.1 情報の公開範囲

| 種類 | 例 | 公開先 |
|---|---|---|
| Public | CO・投票・死亡・発言 | 全エージェント |
| Private | 本当の役職・夜の結果 | システムのみ（LLMには渡さない） |
| Wolf-only | 狼仲間の名前 | 人狼エージェントのみ（昼フェーズのプロンプトに明示）。仲間が全滅した場合は「あなたが最後の人狼」と伝える |
| Personal | 疑い・信頼・推理 | 本人のみ |

### 3.2 viewerMode による表示フィルタ

`spectator_log.jsonl` は公開・非公開の全イベントを `is_public` フラグ付きで保存する。
表示時に viewerMode で出し分ける。

- **public モード**: `is_public=true` のイベントのみ表示。`spectator_content` を持つイベントは
  `content`（公開版文面）を表示。`reasoning`（思考）は非表示。未CO のエージェントは役職不明扱い。
- **spectator モード**: 全イベントを表示。`spectator_content` を持つイベントは `spectator_content`
  を表示。`reasoning` を思考ログとして表示。真の役職で色付け。

| 要素 | spectator | public |
|---|---|---|
| 役職タグ | 真の役職を常時表示 | 未CO は「役職不明」 |
| CO バッジ | 公言役職の役職色で表示。真の役職タグと見比えることで偽CO と判別可能 | 公言役職の役職色で表示（同一） |
| 思考ログ（`reasoning`） | 展開可 | ロックバッジ（存在のみ示す） |
| 文面択一（`spectator_content`） | `spectator_content` を表示 | `content` を表示 |

CLI の色仕様（役職別カラーなど）は [Spec.md §5](Spec.md) を参照。

---

## 4. spectator_log.jsonl フィールドスキーマ

`LogEvent`（`src/domain/event.py`）の全フィールド。1行1イベントの JSONL。

| フィールド | 型 | 既定 | 説明 |
|---|---|---|---|
| `id` | `str` | UUID 自動採番 | イベント一意 ID |
| `day` | `int` | — | ゲーム内日数 |
| `phase` | `str` | — | フェーズ名（`Phase` enum の値） |
| `event_type` | `EventType` | — | イベント種別（§1） |
| `agent` | `str \| null` | `null` | 行動主体のエージェント名 |
| `target` | `str \| null` | `null` | 対象エージェント名（投票先・襲撃先・護衛先など） |
| `content` | `str` | `""` | 公開版の本文 |
| `is_public` | `bool` | `true` | イベント全体の公開可否（§2） |
| `speech_id` | `int \| null` | `null` | 発言通し番号（`speech` の参照用） |
| `reply_to` | `int \| null` | `null` | challenge 時の反論対象 `speech_id` |
| `claimed_role` | `str \| null` | `null` | CO で公言した役職（`speech` に付随） |
| `inspection_role` | `str \| null` | `null` | 占い結果の役職名（`"Werewolf"` / `"Villager"`） |
| `reasoning` | `str` | `""` | spectator 限定の思考・理由（§2） |
| `vote_strategy` | `str` | `""` | VOTE イベント専用の投票戦略。狼エージェントのみ `"wolf_side"` / `"village_side"` を設定する。旧アーカイブ（`vote_strategy` が存在しないログ）の replay では `decision` にフォールバックする |
| `decision` | `str` | `""` | エージェントのツール選択結果。`speech` イベントでは DISCUSSION ツール選択（`"speak"` / `"challenge"` / `"silent"` / `"co"`）を保持する。`judgment` イベントでは旧 DISCUSSION 判断選択を保持する。旧アーカイブの `speech` イベントには空文字が入っており、VOTE の投票戦略は `vote_strategy` フィールドへ移行済み |
| `spectator_content` | `str` | `""` | spectator 版の本文。空なら `content` を使う（§2） |
| `winner` | `str \| null` | `null` | `game_over` イベント専用。勝者陣営（`"Villagers"` / `"Werewolves"`）。他イベントでは `null` |

---

## 5. エージェント JSON スキーマ（state/agents/*.json）

エージェント1体は `ActorProfile`（静的）＋ `ActorState`（動的）＋ `role`（役職名）で構成され、
`{ "profile": {...}, "state": {...}, "role": "..." }` の形で永続化される。
正本は `src/domain/actor.py`。

### 5.1 ActorProfile（静的プロフィール）

| フィールド | 型 | 既定 | 説明 |
|---|---|---|---|
| `name` | `str` | — | エージェント名 |
| `model` | `str` | `"claude-haiku-4-5-20251001"` | 使用 LLM モデル ID |
| `persona` | `Persona` | — | キャラクター属性（§5.3） |

### 5.2 ActorState（動的状態）

| フィールド | 型 | 既定 | 説明 |
|---|---|---|---|
| `beliefs` | `dict[str, Belief]` | `{}` | 他プレイヤーへの疑い・信頼・理由 |
| `memory_summary` | `list[str]` | `[]` | 今回のゲームで蓄積された中期記憶 |
| `is_alive` | `bool` | `true` | 生存フラグ |
| `claimed_role` | `str \| null` | `null` | 公言した役職（CO済みなら設定。未COは null） |
| `intended_co` | `str \| null` | `null` | 次の発言でCOする予定の役職。未予定なら null |
| `threat_scores` | `dict[str, float]` | `{}` | 人狼視点の脅威度（0.0=安全〜1.0=排除必須） |

`Belief` は `{ suspicion: float = 0.5, reason: list[str] = [] }`。

### 5.3 Persona（キャラクター属性）

ゲームをまたいで固定されるキャラクターの個性。

| フィールド | 型 | 既定 | 説明 |
|---|---|---|---|
| `style` | `str` | — | 性格の文字列説明（例: `"logical, calm, empathic"`） |
| `lie_tendency` | `float` | `0.2` | 嘘のつきやすさ（0.0〜1.0） |
| `aggression` | `float` | `0.3` | 攻撃性（0.0〜1.0） |
| `gender` | `str \| null` | `null` | 性別（`"male"` / `"female"` / `"non-binary"` 等） |
| `age` | `str \| null` | `null` | 年齢または年代（例: `"17"`, `"teen"`, `"adult"`） |
| `speech_style` | `str` | `"casual"` | 口調（`"polite"` / `"casual"` / `"blunt"` / `"gentle"` / `"tsundere"`） |
