<!-- Template Version: 22 (2025-12-20) -->

# Setup Sentry Error Tracking for Production Lambda

<!--
## AI向け更新ルール

この進捗ドキュメントは生きた文書。新情報が出るたびに該当セクションのみを更新する。
このファイルはgitにコミットしない（issyncでGitHub Issueと同期される）。

**ワークフロー（6ステート）:**
plan → poc → architecture-decision → implement → retrospective → done

**MUST:**
- 変更は該当セクションのみ、最小限に
- 箇条書きで簡潔に
- 既存の簡潔な表現を維持

**NEVER:**
- 複数セクションを同時に大幅書き換え
- 既存表現を冗長に置き換え
- 情報を別の表現で繰り返す
-->

---

## Purpose / Overview

Integrate Sentry error tracking SDK into the AWS Lambda email processor to enable production error monitoring and alerting.

**Problem:** Currently, errors are only logged to CloudWatch Logs with 14-day retention. This makes it difficult to:
- Track error trends over time
- Get real-time alerts for production issues
- Aggregate and deduplicate similar errors
- Capture rich error context for debugging

**Core Values:**
- Real-time error visibility without manual log diving
- Rich error context (S3 keys, email metadata, Lambda context)
- Minimal performance overhead (<50ms per invocation)

---

## Context & Direction

**Problem Context:**
The slackmail Lambda function processes emails from S3 and posts to Slack. Errors can occur at multiple layers:
- S3 fetch failures (network, permissions, missing objects)
- Email parsing errors (malformed MIME, encoding issues)
- Slack API errors (rate limits, invalid tokens, archived channels)
- Batch processing errors (partial failures in S3 event batches)

Current error handling uses console.error() → CloudWatch Logs, which requires manual log queries and has limited retention.

**Design Philosophy:**
- **Production-Only Monitoring**: Only enable Sentry in production environment to avoid noise from dev/staging
- **Fail-Safe Integration**: Sentry failures must not break email processing (wrap in try-catch)
- **Context-Rich Errors**: Enrich errors with S3 bucket/key, email metadata, Lambda request ID for debugging
- **Smart Filtering**: Don't send expected errors (validation failures) to reduce noise and costs

---

## Validation & Acceptance Criteria

<!--
When: plan（スケルトンテスト作成）→ align-spec（具体化）→ implement（実装）
Do: 受け入れ条件をスケルトンテストとして定義。全テストパス = 完了条件

CRITICAL: テストファイルを参照し、検証コマンドを記載
- planフェーズで test.todo() としてテストケースを定義
- align-specフェーズで仕様確定後にテスト内容を具体化
- テスト困難な場合 → Open Questionsへ
-->

**テストファイル**: `infra/aws/tests/monitoring/sentry.test.ts`

**検証コマンド**:
```bash
cd infra/aws && pnpm test tests/monitoring/sentry.test.ts
```

**テストケース一覧**:
- **Initialization (5 tests)**
  - Should initialize Sentry with DSN from environment variable
  - Should set environment tag to production
  - Should configure default integrations for AWS Lambda
  - Should skip initialization when SENTRY_DSN is not set
  - Should throw error when SENTRY_DSN is invalid format

- **Error Capture (5 tests)**
  - Should capture BatchProcessingError with failed records context
  - Should capture SlackPostError with Slack error code
  - Should capture S3 fetch errors with bucket and key context
  - Should capture email parsing errors with storage key context
  - Should not capture errors when Sentry is not initialized

- **Context Enrichment (4 tests)**
  - Should add S3 event metadata as breadcrumbs
  - Should add email metadata (messageId, from, subject) to error context
  - Should add Lambda request ID to error tags
  - Should add bucket and key to error tags for S3 operations

- **Error Filtering (3 tests)**
  - Should not send expected validation errors to Sentry
  - Should send unexpected runtime errors to Sentry
  - Should apply sample rate for high-volume errors

- **Performance (3 tests)**
  - Should flush events before Lambda handler completes
  - Should not block handler execution on Sentry flush timeout
  - Should timeout Sentry flush after 2 seconds

**Total: 20 test cases**

---

## Specification / 仕様

<!-- When: architecture-decision | Do: POC知見を基にシステム仕様・アーキテクチャを具体化 -->

### [仕様項目1]

[説明]

---

## Open Questions / 残論点

**Q1: Which Sentry SDK package should we use for AWS Lambda?**

Testing Error Capture scenarios requires knowing the SDK's API for capturing errors with context.

**関連テスト**: `sentry.test.ts` - Error Capture scenarios (5 tests)

**検討案:**
- **[@sentry/serverless]（推奨 🟢）**: Official Sentry SDK for serverless platforms with AWS Lambda support
  - Auto-wraps handler with error capture
  - Built-in Lambda context enrichment (request ID, function name)
  - Automatic flush before handler completes
  - Trade-offs: Slightly higher bundle size (~200KB gzipped)
- **[@sentry/node]**: Generic Node.js SDK
  - More manual setup required (manual flush, context enrichment)
  - Trade-offs: No Lambda-specific optimizations

**Q2: Should Sentry initialization be mandatory or optional in production?**

Affects test: "Should throw error when SENTRY_DSN is invalid format" vs "Should skip initialization when SENTRY_DSN is not set"

**関連テスト**: `sentry.test.ts` - Initialization tests

**検討案:**
- **[Optional]（推奨 🟡）**: Gracefully skip Sentry if SENTRY_DSN is not set
  - Allows gradual rollout (deploy code first, add DSN later)
  - No breaking changes if Sentry account has issues
  - Trade-offs: Silent failure if DSN is accidentally unset
- **[Mandatory]**: Throw error if SENTRY_DSN is missing in production
  - Ensures monitoring is always active
  - Trade-offs: Requires DSN before deployment

**Q3: Where should Sentry initialization occur in the Lambda handler?**

Determines whether initialization errors can be tested and how to structure tests.

**関連テスト**: `sentry.test.ts` - Initialization tests (5 tests)

**検討案:**
- **[Module-level initialization]（推奨 🟢）**: Initialize Sentry outside handler function (like current Slack app setup at line 51-59)
  - Runs once per Lambda container (cold start only)
  - Existing pattern in codebase: `loadEnvConfig()` and `createSlackApp()` are module-level
  - Trade-offs: Harder to test (requires module mocking)
- **[Handler-level initialization]**: Initialize inside handler function
  - Easier to test with dependency injection
  - Trade-offs: Runs on every invocation (performance overhead)

**Q4: How should we enrich error context for different error types?**

Testing Context Enrichment requires defining what context is available for each error type.

**関連テスト**: `sentry.test.ts` - Context Enrichment scenarios (4 tests)

**検討案:**
- **[Error-specific context in catch blocks]（推奨 🟢）**: Add context at error capture site
  - Existing pattern: Lambda handler has access to S3 event, bucket, key (lines 104-108)
  - Use Sentry's `setContext()` or `setTag()` before `captureException()`
  - Example locations:
    - Line 126-132: S3/email processing errors → add bucket, key, messageId
    - BatchProcessingError (line 136-140) → add failed record details
  - Trade-offs: None (most flexible)
- **[Global context at handler start]**: Set context once at handler start
  - Trade-offs: Can't capture email-specific metadata (messageId, from, subject)

**Q5: What error filtering rules should we apply?**

Testing Error Filtering requires knowing which errors are expected vs unexpected.

**関連テスト**: `sentry.test.ts` - Error Filtering scenarios (3 tests)

**検討案:**
- **[Whitelist unexpected errors]（推奨 🟡）**: Only send specific error types to Sentry
  - Send: S3 errors, parsing errors, SlackPostError (non-auth), BatchProcessingError
  - Don't send: Validation errors (empty storageKey), auth errors (invalid_auth)
  - Trade-offs: May miss new error types until whitelist updated
- **[Blacklist expected errors]**: Send all errors except known expected ones
  - Don't send: Validation errors, specific Slack error codes
  - Trade-offs: May send noisy errors (high volume)
- **[No filtering]**: Send all errors
  - Trade-offs: High noise, increased Sentry costs

**Q6: What flush timeout should we use for Sentry?**

Testing Performance requires knowing the timeout value.

**関連テスト**: `sentry.test.ts` - "Should timeout Sentry flush after 2 seconds"

**検討案:**
- **[2 seconds]（推奨 🟢）**: Reasonable timeout for Lambda executions
  - Lambda max timeout is configurable (currently not visible in code)
  - 2s allows Sentry to flush while not blocking too long
  - Trade-offs: May not flush all events on very slow networks
- **[5 seconds]**: Longer timeout for reliability
  - Trade-offs: Blocks handler completion longer
- **[Use @sentry/serverless default]**: SDK handles flush automatically
  - Trade-offs: Unknown timeout value (requires documentation check)

**Q7: Should we add Sentry to packages/core or only infra/aws?**

Affects where error capturing code lives and test structure.

**検討案:**
- **[infra/aws only]（推奨 🟢）**: Keep Sentry integration in Lambda handler layer
  - Core package remains infrastructure-agnostic (current design: clean architecture)
  - Only AWS Lambda deployment uses Sentry
  - Trade-offs: Can't capture errors from core package directly (must capture in handler)
- **[packages/core]**: Add Sentry to core package
  - Could capture errors closer to source (e.g., in SlackApp.postMessage)
  - Trade-offs: Violates clean architecture (core depends on monitoring tool)

**Q8: How should we handle Sentry initialization failures?**

Testing "Should throw error when SENTRY_DSN is invalid format" requires knowing the behavior.

**検討案:**
- **[Log warning and continue]（推奨 🟢）**: Don't break email processing if Sentry fails
  - Wrap `Sentry.init()` in try-catch, log error, continue without monitoring
  - Existing pattern: fail-safe approach for external services
  - Trade-offs: Silent monitoring failure
- **[Throw error]**: Fail fast if Sentry can't initialize
  - Lambda container restarts, tries again
  - Trade-offs: Email processing stops if Sentry has issues

---

## Discoveries & Insights

<!-- When: poc以降、継続的 | Do: 技術的制約・複雑性・失敗原因を記録 -->

**YYYY-MM-DD: [タイトル]**
- [発見内容]
- [学び]

---

## Decision Log

<!-- When: architecture-decision | Do: 技術選定、アーキテクチャ決定、トレードオフを記録 -->

**YYYY-MM-DD: [決定事項]**
- **採用**: [技術・手法]
- **理由**: [簡潔に]
- **比較候補**: [他の選択肢]
- **トレードオフ**: [制約・課題]

---

## Outcomes & Retrospectives

<!-- When: retrospective | Do: 完了内容、品質改善、発見、次のステップを記録 -->

**Phase X 完了 (YYYY-MM-DD)**
- **実装完了**: [概要]
- **発見**: [気づき]
- **次のステップ**: [次の作業]

---

## Follow-up Issues

<!-- When: Open Questions解消時、実装中に発見時 | Do: スコープ外だが将来対応すべき事項 -->

- **[課題]**: [説明] (元: Q1 / 優先度: 中)

---

## Confidence Assessment

<!--
When: 各Phase完了時に必須更新
Do: プロジェクト全体の実装確信度を評価（前回を置き換え）

- 自信度:高🟢 - 方針確定、リスク低
- 自信度:中🟡 - 方針あり、一部不確実
- 自信度:低🔴 - 重要決定が未解決
-->

**自信度**: [自信度:高🟢 / 自信度:中🟡 / 自信度:低🔴] - [理由を1行で]

---

## Current Status

<!--
When: フェーズ開始/完了時に自動更新
- Status: plan/poc/architecture-decision/implement/retrospective/done
- Stage: To Start/In Progress/To Review
-->

**Status**: [plan / poc / architecture-decision / implement / retrospective / done]
**Stage**: [To Start / In Progress / To Review]
**最終更新**: YYYY-MM-DD HH:MM:SS
**ネクストアクション**: [人間が取るべき次のアクション]