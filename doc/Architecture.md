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

### 3.2 Agent State（`src/agent/`）

- エージェントの状態（役職・信念・記憶・人格パラメータ）を管理
- 状態は `state/agents/{name}.json` に永続化
- Pydanticモデルでスキーマを定義

#### claimed_role（公開役職）

`AgentState` に `claimed_role: str | None` フィールドを持つ。

| フィールド | 内容 |
|---|---|
| `role` | 真の役職（システム管理。LLMには渡さない） |
| `claimed_role` | エージェントが公言した役職（CO済みなら設定。未COはNull） |

- `intent.co` がLLM出力に含まれたタイミングでGame Engineが `claimed_role` に保存
- `claimed_role` は **Public情報** として全エージェントのプロンプトに渡す
- UIのカラー表示も `claimed_role` を参照（真の役職で色付けしない）

### 3.3 LLM Client（`src/llm/`）

- `anthropic` SDKのラッパー
- 性格プロンプト・役職プロンプトを組み合わせてエージェントごとのシステムプロンプトを生成
- LLMの出力をPydanticモデルで受け取る

#### 呼び出し種別

| 関数 | 用途 | プロンプト | 出力モデル |
|---|---|---|---|
| `call()` | 発言生成（OPENING / DISCUSSION） | フル（役職・性格・記憶・当日ログ・他者のCO情報） | `AgentOutput` |
| `call_judgment()` | 判断（DISCUSSION 並列） | 軽量（役職・性格・memory_summary・直近発言のみ） | `JudgmentOutput` |
| `call_night_action()` | 夜行動 | 夜フェーズ専用 | `str`（ターゲット名） |

#### 並列実行

`call_judgment()` は全生存エージェント分を `concurrent.futures.ThreadPoolExecutor` で並列実行する。
outputが数トークンで済むため、全員分をほぼ同時に完了できる。

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
- 判断フェーズ: `ThreadPoolExecutor` で全エージェント分の `call_judgment()` を並列投げ
- `as_completed()` でレスポンスが返ってきた順に処理
- silent でないエージェントはその場で `call()` を呼んで発言生成 → `today_log` に即追記
- 追記されたログは次のエージェントの発言生成プロンプトに自動的に反映される
- challenge 時は `reply_to`（speech_id）をプロンプトに含めることでどの発言への反応かを指示する

**理由**
- 判断プロンプトは軽量（memory_summary + 直近発言のみ）なので並列実行しても低コスト
- レスポンス順発言により「先に返ってきた反応が場の流れを作る」自然な会話ダイナミクスが生まれる
- challenge 時の speech_id 参照で、どの発言への反応かがログ上で追跡できる

**結果・トレードオフ**
発言順が実行ごとに変わる（非決定論的だが意図的）。全員silentのケースに備えてフォールバックが必要。
