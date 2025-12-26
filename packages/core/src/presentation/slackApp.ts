import { App, AwsLambdaReceiver } from '@slack/bolt';
import type { Email } from '@/domain/entities';
import { formatEmailForSlack } from './emailFormatter';

export interface SlackAppConfig {
  signingSecret: string;
  botToken: string;
  channel: string;
}

/**
 * Create Slack Bolt App with AwsLambdaReceiver
 */
export function createSlackApp(config: SlackAppConfig): {
  app: App;
  receiver: AwsLambdaReceiver;
} {
  const receiver = new AwsLambdaReceiver({
    signingSecret: config.signingSecret,
  });

  const app = new App({
    token: config.botToken,
    receiver,
  });

  return { app, receiver };
}

/**
 * Custom error for Slack API failures
 */
export class SlackPostError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'SlackPostError';
  }
}

/**
 * Map common Slack error codes to user-friendly messages
 */
function getSlackErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    // Channel errors
    channel_not_found:
      'Slack channel not found. Please check SLACK_CHANNEL_ID.',
    not_in_channel:
      'Bot is not a member of the channel. Please invite the bot.',
    is_archived: 'The channel has been archived.',
    // Authentication/authorization errors
    invalid_auth: 'Invalid Slack bot token. Please check SLACK_BOT_TOKEN.',
    not_authed: 'No authentication token provided. Please set SLACK_BOT_TOKEN.',
    account_inactive:
      'Slack workspace or user account is inactive. Please check workspace status.',
    token_revoked:
      'Slack bot token has been revoked. Please regenerate the token.',
    token_expired: 'Slack bot token has expired. Please regenerate the token.',
    no_permission: 'Bot lacks required permissions. Please check OAuth scopes.',
    missing_scope:
      'Bot is missing required OAuth scopes. Please add chat:write scope.',
    // Other errors
    msg_too_long: 'Message is too long for Slack.',
    rate_limited: 'Rate limited by Slack API. Please retry later.',
  };
  return errorMessages[errorCode] || `Slack API error: ${errorCode}`;
}

/**
 * Post email to Slack channel
 */
export async function postEmailToSlack(
  app: App,
  channel: string,
  email: Email,
): Promise<string | undefined> {
  if (!channel || channel.trim().length === 0) {
    console.error('postEmailToSlack: channel is empty');
    throw new SlackPostError('Channel cannot be empty', 'invalid_channel');
  }

  const { text, blocks } = formatEmailForSlack(email);

  try {
    const result = await app.client.chat.postMessage({
      channel,
      text,
      blocks,
    });

    if (!result.ok) {
      const errorCode = result.error || 'unknown_error';
      const message = getSlackErrorMessage(errorCode);
      console.error(`postEmailToSlack failed: ${message}`);
      throw new SlackPostError(message, errorCode);
    }

    return result.ts;
  } catch (error) {
    if (error instanceof SlackPostError) {
      throw error;
    }

    // Handle Slack API errors thrown as exceptions
    const slackError = error as {
      code?: string;
      message?: string;
      data?: { error?: string; message?: string };
    };
    const errorCode = slackError.code || 'unknown_error';

    // Extract actual error from error.data for slack_webapi_platform_error
    if (errorCode === 'slack_webapi_platform_error') {
      const actualError = slackError.data?.error || 'unknown_platform_error';
      const actualMessage =
        slackError.data?.message || slackError.message || 'Unknown error';
      console.error(
        `Slack platform error: ${actualError} - ${actualMessage}`,
        error,
      );
      const enrichedMessage = `Slack API error: slack_webapi_platform_error (actual: ${actualError})\nOriginal message: ${actualMessage}`;
      throw new SlackPostError(enrichedMessage, actualError);
    }

    const message = getSlackErrorMessage(errorCode);
    console.error(`postEmailToSlack exception: ${message}`, error);
    throw new SlackPostError(message, errorCode);
  }
}

/**
 * Failed email record for dead-letter queue
 */
export interface FailedEmailRecord {
  email: Email;
  channel: string;
  error: string;
  errorCode?: string;
  timestamp: Date;
  attempts: number;
}

/**
 * Handler for failed emails (dead-letter queue)
 */
export type FailedEmailHandler = (record: FailedEmailRecord) => Promise<void>;

/**
 * Default failed email handler (logs to console)
 */
const defaultFailedEmailHandler: FailedEmailHandler = async (record) => {
  console.error('Email permanently failed after retries:', {
    messageId: record.email.messageId,
    from: record.email.from.address,
    subject: record.email.subject,
    channel: record.channel,
    error: record.error,
    errorCode: record.errorCode,
    attempts: record.attempts,
    timestamp: record.timestamp.toISOString(),
  });
};

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Configuration for email received handler
 */
export interface EmailReceivedHandlerConfig {
  maxRetries?: number;
  initialBackoffMs?: number;
  onFailure?: FailedEmailHandler;
}

/**
 * Create onEmailReceived callback for ReceiveMailUseCase
 */
export function createEmailReceivedHandler(
  app: App,
  channel: string,
  config: EmailReceivedHandlerConfig = {},
): (email: Email) => Promise<void> {
  const {
    maxRetries = 2,
    initialBackoffMs = 1000,
    onFailure = defaultFailedEmailHandler,
  } = config;

  return async (email: Email) => {
    let lastError: SlackPostError | Error | undefined;
    let attempts = 0;

    for (let retry = 0; retry <= maxRetries; retry++) {
      attempts = retry + 1;

      if (retry > 0) {
        const backoffMs = initialBackoffMs * 2 ** (retry - 1);
        console.log(
          `Retrying email ${email.messageId} (attempt ${attempts}/${maxRetries + 1}) after ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }

      try {
        await postEmailToSlack(app, channel, email);
        return;
      } catch (error) {
        lastError = error as SlackPostError | Error;
        console.error(
          `Failed to post email to Slack (attempt ${attempts}/${maxRetries + 1}):`,
          {
            messageId: email.messageId,
            from: email.from.address,
            subject: email.subject,
            channel,
            error: lastError.message,
            errorCode:
              lastError instanceof SlackPostError ? lastError.code : undefined,
          },
        );

        // Don't retry on non-transient errors (configuration/auth issues)
        if (lastError instanceof SlackPostError) {
          const nonRetryableCodes = [
            // Channel configuration errors
            'invalid_channel',
            'channel_not_found',
            'not_in_channel',
            'is_archived',
            // Authentication/authorization errors
            'invalid_auth',
            'not_authed',
            'account_inactive',
            'token_revoked',
            'token_expired',
            'no_permission',
            'missing_scope',
          ];
          if (lastError.code && nonRetryableCodes.includes(lastError.code)) {
            break;
          }
        }
      }
    }

    // All retries exhausted, send to dead-letter handler
    const failedRecord: FailedEmailRecord = {
      email,
      channel,
      error: lastError?.message || 'Unknown error',
      errorCode:
        lastError instanceof SlackPostError ? lastError.code : undefined,
      timestamp: new Date(),
      attempts,
    };

    await onFailure(failedRecord);
    throw lastError;
  };
}
