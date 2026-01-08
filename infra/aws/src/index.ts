import {
  createEmailReceivedHandler,
  createSlackApp,
  MailparserEmailParser,
  ReceiveMailUseCase,
  registerMailSendingListeners,
  SendMailUseCase,
} from '@rindrics/slackmail';
import { AWSLambda } from '@sentry/serverless';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Callback,
  Context,
  S3Event,
  S3Handler,
} from 'aws-lambda';
import { S3StorageRepository } from '@/infrastructure/s3StorageRepository';
import { SESMailRepository } from '@/infrastructure/sesMailRepository';

/**
 * Required environment variables configuration
 */
interface EnvConfig {
  slackSigningSecret: string;
  slackBotToken: string;
  slackChannelId: string;
  emailDomain: string;
  defaultSenderAddress: string;
}

/**
 * Validate and load required environment variables.
 * Fails fast with clear error messages if any are missing.
 */
function loadEnvConfig(): EnvConfig {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  const slackBotToken = process.env.SLACK_BOT_TOKEN?.trim();
  const slackChannelId = process.env.SLACK_CHANNEL_ID?.trim();
  const emailDomain = process.env.EMAIL_DOMAIN?.trim();

  if (
    !slackSigningSecret ||
    !slackBotToken ||
    !slackChannelId ||
    !emailDomain
  ) {
    const missing = [
      !slackSigningSecret && 'SLACK_SIGNING_SECRET',
      !slackBotToken && 'SLACK_BOT_TOKEN',
      !slackChannelId && 'SLACK_CHANNEL_ID',
      !emailDomain && 'EMAIL_DOMAIN',
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
    emailDomain,
    defaultSenderAddress: `noreply@${emailDomain}`,
  };
}

// Validate environment variables at startup (fail fast)
const config = loadEnvConfig();

// Initialize Slack App (singleton)
const { app, receiver } = createSlackApp({
  signingSecret: config.slackSigningSecret,
  botToken: config.slackBotToken,
  channel: config.slackChannelId,
});

// Initialize mail sending dependencies
const mailRepository = new SESMailRepository({
  allowedSenderDomain: config.emailDomain,
  defaultSenderAddress: config.defaultSenderAddress,
});

const sendMailUseCase = new SendMailUseCase(mailRepository);

// Register mail sending listeners (template and send commands)
registerMailSendingListeners(app, {
  sendMailUseCase,
  defaultSenderAddress: config.defaultSenderAddress,
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
 * Type guard to check if event is from API Gateway
 */
function isApiGatewayEvent(
  event: S3Event | APIGatewayProxyEventV2,
): event is APIGatewayProxyEventV2 {
  return 'requestContext' in event && 'http' in (event.requestContext || {});
}

/**
 * Type guard to check if event is from S3
 */
function isS3Event(event: S3Event | APIGatewayProxyEventV2): event is S3Event {
  return 'Records' in event && event.Records?.[0]?.eventSource === 'aws:s3';
}

/**
 * Unified Lambda handler that routes to appropriate handler based on event source.
 * - API Gateway events → Slack Bolt handler
 * - S3 events → Email processing handler
 */
export const handler = async (
  event: S3Event | APIGatewayProxyEventV2,
  context: Context,
  callback: Callback,
): Promise<void | APIGatewayProxyResultV2> => {
  // Handle API Gateway requests (Slack Events API)
  if (isApiGatewayEvent(event)) {
    // Handle Slack URL verification challenge
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.type === 'url_verification' && body.challenge) {
          console.log('[Slack] Responding to URL verification challenge');
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: body.challenge,
          };
        }
      } catch {
        // Not JSON or not a challenge, continue to Bolt handler
      }
    }

    // Delegate to Slack Bolt receiver
    const boltHandler = await receiver.start();
    return boltHandler(event, context, callback);
  }

  // Handle S3 events (email processing)
  if (isS3Event(event)) {
    const wrappedHandler = AWSLambda.wrapHandler(rawHandler, {
      flushTimeout: 2000,
    });
    return wrappedHandler(event, context as never, callback as never);
  }

  console.error('Unknown event type:', JSON.stringify(event));
  throw new Error('Unknown event type');
};
