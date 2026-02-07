# ADR 007: Multi-Tenant Architecture

## Status

**Deprecated** ⚠️

Superseded by [ADR 008: Single User, Multi-Domain Architecture](./008-single-user-multi-domain-architecture.md)

## Context

現在の slackmail は単一の Slack ワークスペースと単一のメールドメインに対応しています。複数の Slack ワークスペースと複数のドメインをサポートするマルチテナント対応が検討されていました。

### なぜ廃止したのか？

2025-02-07 に以下の決定がなされたため：

- **用途**: slackmail は「SaaS プラットフォーム」ではなく、単一ユーザー（@rindrics）向けの「個人用ツール」
- **ニーズ**: 複数のワークスペースをサポートする必要がない
- **管理**: 複数の Slack ワークスペースからの勝手なサインアップを許したくない
- **責任**: SLA 責任を負いたくない
- **結論**: ADR 008「Single User, Multi-Domain Architecture」を採用

### 現在のアーキテクチャの制約

- Slack Bot Token が環境変数で固定
- メールドメインが環境変数で固定
- SES identity が単一ドメイン用に設定
- テナント間のデータ分離がない

## Decision

### リポジトリ構成

2つのリポジトリに分割します：

```text
slackmail (現在のリポジトリ)
├── packages/core        # ビジネスロジック（npm パッケージ）
└── infra/aws            # 実装例 / セルフホスト用

slackmail-saas (新規・モノレポ)
├── packages/
│   ├── platform/        # マルチテナント対応 Lambda
│   ├── console-web/     # 管理画面（Next.js）
│   ├── console-api/     # 管理 API
│   └── billing/         # Stripe 連携
└── infra/               # Pulumi（マルチテナント用）
```

### 責務の分離

| リポジトリ | 責務 |
|-----------|------|
| slackmail | コアロジック、セルフホスト用インフラ例 |
| slackmail-saas | マルチテナント対応、課金、管理画面 |

### @rindrics/slackmail の利用

- npm に公開済み
- slackmail-saas から `npm install @rindrics/slackmail` で利用
- バージョン管理で互換性を維持

## Consequences

### Positive

- 責務が明確に分離される
- セルフホストユーザーは現在のリポジトリをそのまま利用可能
- SaaS 固有の機能（課金、管理画面）が独立
- コアロジックの再利用性が向上

### Negative

- リポジトリ間の依存関係管理が必要
- コアロジックの breaking change 時に両方の対応が必要

### Risks

- @rindrics/slackmail のバージョンアップ時の互換性
  - 対策: semver を厳守、CI で互換性テスト

## References

- [ADR 008: Single User, Multi-Domain Architecture](./008-single-user-multi-domain-architecture.md) - **代替 (Replacement)**
- [Slack App Distribution](https://api.slack.com/start/distributing)
- [AWS SES Multi-Domain Setup](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)

## 将来の参考

このアーキテクチャは「将来 slackmail を SaaS 化する場合」の参考資料として保持しています。現在のニーズには ADR 008 の単一ユーザー向け設計が適切です。

