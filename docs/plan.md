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

### Sentry Integration Architecture

**Package**: `@sentry/serverless` in `infra/aws/package.json`

**Initialization**: Module-level in `infra/aws/src/index.ts` (before handler export)
```typescript
// Module-level initialization (runs once per Lambda container)
const sentryDsn = process.env.SENTRY_DSN?.trim();
if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: 'production',
      tracesSampleRate: 0,
      flushTimeout: 2000,
    });
  } catch (error) {
    console.warn('[Sentry] Initialization failed:', error);
  }
} else {
  console.info('[Sentry] Skipping initialization (SENTRY_DSN not set)');
}

// Wrap handler with Sentry (if initialized)
export const handler = Sentry.wrapHandler(rawHandler);
```

### Error Capture Whitelist

**Capture these errors**:
- S3 fetch errors (GetObjectCommand failures)
- Email parsing errors (mailparser failures)
- SlackPostError (non-auth: rate_limited, msg_too_long, etc.)
- BatchProcessingError (partial batch failures)

**Do NOT capture**:
- Validation errors (empty storageKey)
- Auth-related SlackPostError (invalid_auth, invalid_channel, not_in_channel)

### Context Enrichment Pattern

**In catch blocks** (lines 126-132 in handler):
```typescript
Sentry.setTag('s3_bucket', bucket);
Sentry.setTag('s3_key', key);
Sentry.setContext('email', { messageId, from, subject });
Sentry.addBreadcrumb({ message: `Processing ${bucket}/${key}` });
Sentry.captureException(error);
```

**Auto-captured by @sentry/serverless**:
- Lambda request ID
- Function name
- AWS region

---

## Open Questions / 残論点

**~Q1: Which Sentry SDK package should we use for AWS Lambda?~** ✅ 解決済み (2025-12-26)

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

**決定**: @sentry/serverless
**理由**: Lambda-specific optimizations (auto-wrap, context enrichment, auto-flush) reduce implementation complexity and follow AWS Lambda best practices

**~Q2: Should Sentry initialization be mandatory or optional in production?~** ✅ 解決済み (2025-12-26)

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

**決定**: Optional
**理由**: Gradual rollout support and fail-safe design align with existing error handling philosophy (don't break email processing)

**~Q3: Where should Sentry initialization occur in the Lambda handler?~** ✅ 解決済み (2025-12-26)

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

**決定**: Module-level initialization
**理由**: Matches existing codebase pattern and optimizes for performance (one-time initialization per container)

**~Q4: How should we enrich error context for different error types?~** ✅ 解決済み (2025-12-26)

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

**決定**: Error-specific context in catch blocks
**理由**: Provides maximum debugging context and follows existing Lambda handler pattern where error data is readily available

**~Q5: What error filtering rules should we apply?~** ✅ 解決済み (2025-12-26)

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

**決定**: Whitelist unexpected errors
**理由**: Controlled Sentry costs and signal-to-noise ratio, acceptable trade-off given we can iterate on whitelist based on production needs

**~Q6: What flush timeout should we use for Sentry?~** ✅ 解決済み (2025-12-26)

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

**決定**: 2 seconds
**理由**: Balances reliability (enough time for flush) with Lambda performance (minimal blocking)

**~Q7: Should we add Sentry to packages/core or only infra/aws?~** ✅ 解決済み (2025-12-26)

Affects where error capturing code lives and test structure.

**検討案:**
- **[infra/aws only]（推奨 🟢）**: Keep Sentry integration in Lambda handler layer
  - Core package remains infrastructure-agnostic (current design: clean architecture)
  - Only AWS Lambda deployment uses Sentry
  - Trade-offs: Can't capture errors from core package directly (must capture in handler)
- **[packages/core]**: Add Sentry to core package
  - Could capture errors closer to source (e.g., in SlackApp.postMessage)
  - Trade-offs: Violates clean architecture (core depends on monitoring tool)

**決定**: infra/aws only
**理由**: Preserves clean architecture principle (core remains infrastructure-agnostic), handler layer already has all error context needed

**~Q8: How should we handle Sentry initialization failures?~** ✅ 解決済み (2025-12-26)

Testing "Should throw error when SENTRY_DSN is invalid format" requires knowing the behavior.

**検討案:**
- **[Log warning and continue]（推奨 🟢）**: Don't break email processing if Sentry fails
  - Wrap `Sentry.init()` in try-catch, log error, continue without monitoring
  - Existing pattern: fail-safe approach for external services
  - Trade-offs: Silent monitoring failure
- **[Throw error]**: Fail fast if Sentry can't initialize
  - Lambda container restarts, tries again
  - Trade-offs: Email processing stops if Sentry has issues

**決定**: Log warning and continue
**理由**: Fail-safe design matches existing philosophy (don't break primary function for monitoring), errors still visible in CloudWatch Logs

---

## Discoveries & Insights

**2025-12-26: Lambda Handler Structure and Error Handling Patterns**
- Handler file: `infra/aws/src/index.ts` - S3 event handler with batch processing
- Uses module-level initialization pattern for Slack app (lines 51-59)
- Batch processing collects failures but continues processing remaining records
- Custom error classes: `BatchProcessingError` (handler), `SlackPostError` (core)
- All errors logged with `console.error()` including message and stack trace

**2025-12-26: Testing Infrastructure**
- Vitest 4.0.16 with `aws-sdk-client-mock` for AWS service mocking
- Tests mirror src structure: `tests/{layer}/{domain}/*.test.ts`
- Existing pattern: Dependency injection via constructor for testability
- Mock pattern: `vi.fn()` with type-safe callbacks, `mockClient(S3Client)` for AWS

**2025-12-26: Clean Architecture Adherence**
- packages/core is infrastructure-agnostic (domain, application, infrastructure, presentation layers)
- infra/aws depends on @rindrics/slackmail package
- Adding Sentry to infra/aws preserves this separation

**2025-12-26: Sentry Implementation Discoveries**
- Module-level init requires setting test env vars in vitest.config.ts using dotenv
- infra/aws needed `"type": "module"` in package.json for ES module imports
- Tests must be environment-aware (conditional on SENTRY_DSN presence)
- Sentry.wrapHandler() provides automatic flush - no manual flush needed
- Error filtering at capture site (not global config) for maximum flexibility
- .env file exists in infra/aws/ with Slack credentials (not in root)

---

## Decision Log

**2025-12-26: Sentry SDK Selection and Integration Architecture**
- **採用**: @sentry/serverless with module-level initialization in infra/aws only
- **理由**: Lambda-specific optimizations (auto-wrap, context enrichment, auto-flush), matches existing codebase pattern, preserves clean architecture
- **比較候補**: @sentry/node (more manual setup), handler-level init (performance overhead), packages/core integration (violates clean architecture)
- **トレードオフ**: Slightly higher bundle size (~200KB gzipped), harder to test with module-level mocking

**2025-12-26: Error Handling and Filtering Strategy**
- **採用**: Optional initialization (fail-safe), whitelist unexpected errors, error-specific context in catch blocks
- **理由**: Gradual rollout support, controlled costs/noise, maximum debugging context
- **比較候補**: Mandatory init (requires DSN before deploy), blacklist/no filtering (high noise), global context (limited metadata)
- **トレードオフ**: May miss new error types until whitelist updated, silent monitoring failure if DSN misconfigured

**2025-12-26: Performance Configuration**
- **採用**: 2-second flush timeout with @sentry/serverless auto-flush
- **理由**: Balances reliability with minimal Lambda blocking time
- **比較候補**: 5s timeout (longer blocking), SDK default (unknown value)
- **トレードオフ**: May not flush all events on very slow networks

---

## Outcomes & Retrospectives

**Implementation Phase Complete (2025-12-26)**
- **実装完了**: Sentry error tracking integration for production Lambda with @sentry/serverless SDK
- **実装内容**:
  - Module-level Sentry initialization with optional DSN (fail-safe)
  - Error capturing with context enrichment (S3 bucket/key, BatchProcessingError details)
  - Whitelist-based error filtering (S3, parsing, non-auth Slack errors)
  - 20 comprehensive tests covering initialization, capture, context, filtering, performance
  - Fixed infra/aws ES module support (`"type": "module"`)
  - Pulumi configuration for SENTRY_DSN (config.ts, lambda.ts, GitHub Actions workflow)
- **発見**:
  - Vitest module-level mocking requires careful setup with beforeAll + dynamic imports
  - Environment-aware tests needed for optional features (SENTRY_DSN)
  - dotenv in vitest.config.ts enables .env loading for tests
  - Pulumi config best practice: use environment variables for secrets (not Pulumi.<stack>.yaml)
- **品質**: All 22 tests passing (2 existing + 20 new), no regressions
- **次のステップ**: Set SENTRY_DSN in GitHub repository secrets, merge PR, deploy to production

---

## Follow-up Issues

<!-- When: Open Questions解消時、実装中に発見時 | Do: スコープ外だが将来対応すべき事項 -->

- **[課題]**: [説明] (元: Q1 / 優先度: 中)

---

## Confidence Assessment

**自信度**: 自信度:高🟢 - All architectural decisions finalized, implementation approach clear, tests specify exact behavior

---

## Current Status

**Status**: retrospective
**Stage**: To Review
**最終更新**: 2025-12-26 02:25:00
**ネクストアクション**: Add SENTRY_DSN to Pulumi config/secrets, update Lambda environment variables via Pulumi, deploy and verify error tracking in Sentry dashboard