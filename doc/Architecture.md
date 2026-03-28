# {ProjectName} アーキテクチャ設計書

本ドキュメントでは、アプリケーションの設計・構成について記述します。

## 1. ディレクトリ構成
<!-- プロジェクトのディレクトリ構成を記述 -->

```text
{ProjectName}/
├── .github/workflows/
│   ├── ci.yml             # Push/PR 時: ruff + pytest
│   └── cron.yml           # 定期実行バッチ（必要な場合）
├── doc/                   # ドキュメント配置ディレクトリ
│   ├── Architecture.md    # 本ドキュメント
│   ├── Spec.md            # 仕様書
│   └── Task.md            # タスク管理
├── src/                   # ソースコード
├── tests/
│   ├── conftest.py
│   ├── e2e/
│   ├── unit/
│   ├── fixtures/
│   └── TestStrategy.md
└── requirements.txt
```

## 2. 設計方針
<!-- アーキテクチャ上の主要な設計判断・採用技術・その理由を記述 -->

---

## 3. 開発ワークフローとCI/CD

品質を担保するため、**プルリクエスト駆動開発 (PR Workflow)** と自動化されたCIを利用します。

### 3.1 Branch Protection (masterの保護)
- `master` ブランチへの直接のプッシュは禁止。
- 全ての変更は作業ブランチ（例: `feature/xxx`, `fix/yyy`）からプルリクエスト経由でマージする。
- マージには、GitHub Actions によるステータスチェック（Lint および Test）のパスが必須。

### 3.2 CI (継続的インテグレーション)
GitHub Actions により、PR作成時およびPush時に以下のチェックが自動で実行されます。

- **Ruff**: Linter & Formatter。コーディング規約違反や未使用インポートを検知。
- **pytest**: 単体テスト・E2Eテストを実行し、デグレを防ぐ。

### 3.3 開発手順
1. `git checkout -b feature/your-feature-name` でブランチを作成
2. 開発を行い、ローカルでテスト (`ruff check .`, `pytest`)
3. コミット・プッシュし、GitHub 上で `master` 宛の PR を作成
4. CI の全パスを確認後、マージを実行

---

## 4. アーキテクチャ上の意思決定記録 (ADR)

主要な設計判断を記録し、「なぜそうしたか」を残す。

---

### ADR-001: {タイトル}

**状況**
<!-- どのような問題・状況があったか -->

**決定**
<!-- 何を決定したか -->

**理由**
<!-- なぜその決定をしたか -->

**検討した代替案**
<!-- 他に何を検討したか -->

**結果・トレードオフ**
<!-- 採用によって生じるメリット・デメリット -->
