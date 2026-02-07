# ADR 008: Single User, Multi-Domain Architecture

## Status

**Accepted** ✅

## Context

現在の slackmail は単一の Slack ワークスペースと単一のメールドメインに対応しています。

単一ユーザーが複数のメールドメインで送受信したいというニーズがあります。

### 現在の制約

- ALLOWED_SENDER_DOMAIN が環境変数で固定
- 1つのドメインからのみメール送信可能
- 複数のドメインを使い分けたい場合は不便

### 検討した選択肢

1. **オプション A: 複数 Lambda デプロイ**
   - 各ドメインごとに独立した Lambda スタック
   - ❌ インフラ複雑度が高い
   - ❌ コスト効率が悪い（複数の idle Lambda）

2. **オプション B: 単一ユーザー向けマルチドメイン（選択）**
   - 1つの Slack ワークスペース
   - 1つの Lambda
   - 複数ドメイン管理は DynamoDB で
   - ✅ シンプルで効率的

3. **オプション C: 自由サインアップ対応（多人数対応）**
   - 複数の Slack ワークスペースをサポート
   - OAuth で自動インストール
   - ❌ 複雑度が 4 倍（1日 → 1週間の実装）
   - ❌ SLA 責任が発生する
   - ❌ 運用コストが高い

## Decision

**オプション B を選択**：単一ユーザー向けマルチドメイン対応

### 実装アーキテクチャ

```
┌─────────────────────────────────┐
│  Your Slack Workspace           │
│  (Single: T123456789)           │
└────────────┬────────────────────┘
             │
     ┌───────▼─────────┐
     │ Single Lambda   │
     │ (Multi-domain)  │
     └───────┬─────────┘
             │
     ┌───────▼──────────────────────┐
     │ DynamoDB Config Table        │
     │ ┌─────────────────────────┐  │
     │ │ slackTeamId: T123456789 │  │
     │ ├─ slackBotToken: xoxb-..│  │
     │ ├─ slackChannelId: C12345│  │
     │ ├─ emailDomains: [       │  │
     │ │    - akirahayashi.com  │  │
     │ │    - mydomain.com      │  │
     │ │    - otherdomain.com   │  │
     │ │  ]                     │  │
     │ └─────────────────────────┘  │
     └───────┬──────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
  ┌─────┐       ┌──────┐
  │ SES │       │  S3  │
  └─────┘       └──────┘
```

### DynamoDB スキーマ

**Table**: `slackmail-config`

```typescript
{
  // Partition Key
  slackTeamId: "T123456789",

  // Slack Configuration
  slackBotToken: "xoxb-...",
  slackChannelId: "C123456",
  slackSigningSecret: "...",

  // Email Domains (配列で複数ドメイン管理)
  emailDomains: [
    {
      domain: "akirahayashi.com",
      defaultSender: "noreply@akirahayashi.com",
      status: "active"
    },
    {
      domain: "mydomain.com",
      defaultSender: "noreply@mydomain.com",
      status: "active"
    }
  ],

  // Status
  status: "active",
  createdAt: "2025-02-07T10:00:00Z",
  updatedAt: "2025-02-07T10:00:00Z"
}
```

### OAuth Security

**自由サインアップは拒否**します：

```typescript
async function handleOAuthCallback(code: string, teamId: string) {
  // Team ID が DynamoDB に存在するか確認
  const config = await dynamodb.get(teamId);

  if (!config) {
    // 登録されていない → インストール拒否
    return {
      statusCode: 403,
      body: 'This workspace is not registered.'
    };
  }

  // 登録済みのみ：トークン更新
  const token = await exchangeCodeForToken(code);
  await dynamodb.update(teamId, { slackBotToken: token });

  return {
    statusCode: 200,
    body: 'Successfully updated!'
  };
}
```

**結果**：
- ✅ 勝手なサインアップを防止
- ✅ あなただけが複数ドメイン管理可能
- ✅ SLA 責任がない

### MailRepository インターフェース更新

**Issue #12 の実装に追加**：

```typescript
// 現在
interface MailRepository {
  sendEmail(email: Email): Promise<string>;
}

// 将来のマルチドメイン対応
interface MailRepository {
  sendEmail(email: Email, context: SendContext): Promise<string>;
}

interface SendContext {
  slackTeamId: string;  // テナント識別（現在は 1 つのみ）
}
```

### Slack Event Handler 更新

```typescript
slackApp.event('app_mention', async (event, client) => {
  const slackTeamId = event.team_id;

  // DynamoDB から設定取得
  const config = await dynamodb.getConfig(slackTeamId);
  if (!config) {
    await client.chat.postMessage({
      channel: event.channel,
      text: '❌ Workspace not configured.'
    });
    return;
  }

  // メール送信（ドメイン検証付き）
  const email = await parseEmailFromMessage(event);
  const senderDomain = email.from.address.split('@')[1];

  if (!config.emailDomains.map(d => d.domain).includes(senderDomain)) {
    await client.chat.postMessage({
      channel: event.channel,
      text: `❌ Domain @${senderDomain} not registered`
    });
    return;
  }

  await sendMailUseCase.execute(email, slackTeamId);
});
```

## Implementation Roadmap

### Phase 1: Issue #12（現在）
- ✅ MailRepository インターフェース
- ✅ SESMailRepository 実装
- ✅ Slack メール送信 UI
- ⏳ Status: **進行中**

### Phase 2: DynamoDB マルチドメイン対応（Issue TBD）
- [ ] DynamoDB テーブル作成
- [ ] TenantConfig リポジトリ実装
- [ ] OAuth Callback Lambda
- [ ] Event handler をテナント対応に更新
- **Estimated**: 1-2 週間

### Phase 3: ドメイン管理 UI（将来）
- [ ] Slack コマンド `/setup-domain`
- [ ] Domain verification フロー
- [ ] DynamoDB でドメイン状態管理

## Consequences

### Positive

- ✅ **シンプル**: SaaS 機能が不要
- ✅ **安全**: 勝手なサインアップを防止
- ✅ **低コスト**: DynamoDB 追加で +$1-5/月
- ✅ **保守性**: テナント管理ロジックが単純
- ✅ **スケーラビリティ**: 複数ドメイン対応でも Lambda 1つ
- ✅ **責任明確**: あなたのみが SLA 責任

### Negative

- ❌ **新ドメイン追加時**: Git → DynamoDB への手動マイグレーション必要
- ❌ **UI**: CLI/AWS Console での管理（Slack UI はなし）
- ⚠️ **将来拡張**: 他人に開放する場合は大幅リファクタリング必要

### Risks

- 将来、他人にも開放したくなった場合
  - 対策: `docs/signup-models.md` で段階的な移行パス記載
  - 対策: マルチドメイン設計と多人数対応設計を分離

## Not Chosen Options

### オプション A: 複数 Lambda デプロイ

```
Domain A → Lambda A → SES
Domain B → Lambda B → SES
Domain C → Lambda C → SES
```

**却下理由**:
- ❌ 複数スタック管理が複雑
- ❌ Lambda 数分のコスト（コールドスタート）
- ❌ インフラ構成が N 倍に増加
- ✅ データ分離の必要なし（元々単一ユーザー）

### オプション C: 自由サインアップ対応

```
複数 Slack ワークスペース
    ↓
Shared Lambda（マルチテナント）
    ↓
複数ドメイン管理
```

**却下理由**:
- ❌ SLA 責任が発生（他人が使うため）
- ❌ 実装期間 12 時間（1-2 日）
- ❌ 運用コストが高い（テナント隔離、監視）
- ❌ セキュリティリスク（テナント間データ漏洩）
- ⚠️ 課金機能が必要（Stripe 等）

**参考**: `docs/signup-models.md` で詳細な比較あり

## Related Documents

- `docs/multi-domain-design.md` - 実装設計書
- `docs/signup-models.md` - オプション比較
- `docs/issue-12.md` - メール送信機能
- `docs/multi-tenant.md` - 将来の SaaS 化オプション

## Timeline

| フェーズ | 内容 | 期間 | ステータス |
|--------|------|------|----------|
| Phase 1 | MailRepository + Slack UI | 完了 | ✅ 進行中 |
| Phase 2 | DynamoDB マルチドメイン | 1-2 週間 | ⏳ 予定 |
| Phase 3 | Domain management UI | 3-4 日 | 📅 将来 |

## Questions to Revisit

- [ ] 複数ワークスペース対応の必要性は今後発生しないか？
- [ ] ドメイン追加時のセットアップフローは何が最適か？
- [ ] Phase 3 で管理画面を作るか、AWS Console のみか？

## Decision Log

**2025-02-07**: このアーキテクチャを確定

- ✅ 自由サインアップは不要
- ✅ 単一ユーザーのみ対応
- ✅ 複数ドメイン管理は DynamoDB で実装
- ✅ Phase 2 で DynamoDB マイグレーション予定

## References

- AWS SES Domain Verification: https://docs.aws.amazon.com/ses/latest/dg/verify-domain-procedure.html
- AWS DynamoDB Best Practices: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html
- Slack OAuth Documentation: https://api.slack.com/authentication/oauth-v2
