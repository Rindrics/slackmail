import {
  createEmailReceivedHandler,
  createSlackApp,
  MailparserEmailParser,
  ReceiveMailUseCase,
} from '@rindrics/slackmail';
import { AWSLambda } from '@sentry/serverless';
import type { S3Event, S3Handler } from 'aws-lambda';
import { S3StorageRepository } from '@/infrastructure/s3StorageRepository';

/**
 * Required environment variables configuration
 */
interface EnvConfig {
  slackSigningSecret: string;
  slackBotToken: string;
  slackChannelId: string;
}

/**
 * Validate and load required environment variables.
 * Fails fast with clear error messages if any are missing.
 */
function loadEnvConfig(): EnvConfig {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  const slackBotToken = process.env.SLACK_BOT_TOKEN?.trim();
  const slackChannelId = process.env.SLACK_CHANNEL_ID?.trim();

  if (!slackSigningSecret || !slackBotToken || !slackChannelId) {
    const missing = [
      !slackSigningSecret && 'SLACK_SIGNING_SECRET',
      !slackBotToken && 'SLACK_BOT_TOKEN',
      !slackChannelId && 'SLACK_CHANNEL_ID',
    ].filter(Boolean);

    for (const name of missing) {
      console.error(`[Config Error] ${name} is required but not set`);
    }
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  // TypeScript narrows types after the guard above
  return {
    slackSigningSecret,
    slackBotToken,
    slackChannelId,
  };
}

// Validate environment variables at startup (fail fast)
const config = loadEnvConfig();

// Initialize Slack App (singleton)
const { app } = createSlackApp({
  signingSecret: config.slackSigningSecret,
  botToken: config.slackBotToken,
  channel: config.slackChannelId,
});

/**
 * Initialize Sentry for error tracking (optional, fail-safe)
 * Module-level initialization runs once per Lambda container
 */
const sentryDsn = process.env.SENTRY_DSN?.trim();
if (sentryDsn) {
  try {
    AWSLambda.init({
      dsn: sentryDsn,
      environment: 'production',
      tracesSampleRate: 0, // Disable performance tracing
    });
    console.info('[Sentry] Initialized successfully');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.warn('[Sentry] Initialization failed:', err.message);
  }
} else {
  console.info('[Sentry] Skipping initialization (SENTRY_DSN not set)');
}

/**
 * Helper function to determine if an error should be sent to Sentry
 * Uses whitelist approach to capture only unexpected errors
 */
function shouldCaptureError(error: Error): boolean {
  // Whitelist: Capture S3 errors, parsing errors, non-auth SlackPostError, BatchProcessingError
  // Exclude: Validation errors, auth-related errors

  // Check for validation errors (empty storageKey)
  if (error.message.includes('storageKey cannot be empty')) {
    return false;
  }

  // Check for auth-related Slack errors (these are expected configuration issues)
  const authErrorCodes = [
    'invalid_auth',
    'invalid_channel',
    'channel_not_found',
    'not_in_channel',
  ];

  // SlackPostError has a 'code' property
  if ('code' in error && typeof error.code === 'string') {
    if (authErrorCodes.includes(error.code)) {
      return false;
    }
  }

  // Capture all other errors (S3 errors, parsing errors, other SlackPostError, BatchProcessingError)
  return true;
}

/**
 * Record of a failed S3 record processing
 */
interface FailedRecord {
  bucket: string;
  key: string;
  error: Error;
}

/**
 * Custom error for batch processing failures.
 * Contains details of all failed records while allowing successful records to complete.
 *
 * Approach: We use AggregateError pattern to collect all failures and throw after
 * processing all records. This ensures maximum throughput while still surfacing
 * failures to Lambda for retry/DLQ handling. Lambda will mark the entire batch
 * as failed, but successful records have already been processed.
 */
export class BatchProcessingError extends Error {
  constructor(
    public readonly failedRecords: FailedRecord[],
    public readonly totalRecords: number,
  ) {
    const failedKeys = failedRecords.map((r) => r.key).join(', ');
    super(
      `Failed to process ${failedRecords.length}/${totalRecords} records: ${failedKeys}`,
    );
    this.name = 'BatchProcessingError';
  }
}

/**
 * Lambda handler for S3 email events.
 * Triggered when a new email is stored in the S3 bucket.
 *
 * Processes each record independently, collecting errors and continuing
 * to process remaining records. Throws BatchProcessingError if any
 * records fail, after all records have been attempted.
 */
const rawHandler: S3Handler = async (event: S3Event) => {
  const failedRecords: FailedRecord[] = [];
  const totalRecords = event.Records.length;

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing email from s3://${bucket}/${key}`);

    try {
      const storageRepository = new S3StorageRepository(bucket);
      const emailParser = new MailparserEmailParser();
      const onEmailReceived = createEmailReceivedHandler(
        app,
        config.slackChannelId,
      );

      const useCase = new ReceiveMailUseCase({
        storageRepository,
        emailParser,
        onEmailReceived,
      });

      const result = await useCase.execute({ storageKey: key });
      console.log(`Successfully processed email: ${result.email.messageId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to process email from s3://${bucket}/${key}:`, {
        error: err.message,
        stack: err.stack,
      });

      // Capture error to Sentry with context enrichment (if initialized and whitelisted)
      if (sentryDsn && shouldCaptureError(err)) {
        AWSLambda.setTag('s3_bucket', bucket);
        AWSLambda.setTag('s3_key', key);
        AWSLambda.addBreadcrumb({
          message: `Processing email from s3://${bucket}/${key}`,
          level: 'info',
        });
        AWSLambda.captureException(err);
      }

      failedRecords.push({ bucket, key, error: err });
    }
  }

  if (failedRecords.length > 0) {
    console.error(
      `Batch processing completed with failures: ${failedRecords.length}/${totalRecords} records failed`,
    );
    const batchError = new BatchProcessingError(failedRecords, totalRecords);

    // Capture BatchProcessingError to Sentry with failed records context
    if (sentryDsn) {
      AWSLambda.setContext('failed_records', {
        count: failedRecords.length,
        total: totalRecords,
        keys: failedRecords.map((r) => r.key),
      });
      AWSLambda.captureException(batchError);
    }

    throw batchError;
  }

  console.log(
    `Batch processing completed successfully: ${totalRecords} records`,
  );
};

/**
 * Export handler wrapped with Sentry for automatic error capturing and flushing
 */
export const handler = AWSLambda.wrapHandler(rawHandler, {
  flushTimeout: 2000, // 2 second flush timeout
});
