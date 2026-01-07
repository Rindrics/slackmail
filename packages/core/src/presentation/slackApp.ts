import { App, AwsLambdaReceiver } from '@slack/bolt';
import type { Email } from '@/domain/entities';
import { formatEmailForSlack } from './emailFormatter';
import { generateEmailTemplate } from './emailTemplateGenerator';
import { parseMessageUrl } from './messageUrlParser';
import { fetchMessage } from './messageFetcher';
import { parseEmailTemplate } from './emailTemplateParser';
import type { MailRepository } from '@/domain/repositories';

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

  const { text, blocks, bodyAsFile } = formatEmailForSlack(email);

  try {
    // Post the main message first
    const result = await app.client.chat.postMessage({
      channel,
      text,
      blocks,
    });

    if (!result.ok || !result.ts) {
      const errorCode = result.error || 'unknown_error';
      const message = getSlackErrorMessage(errorCode);
      console.error(`postEmailToSlack failed: ${message}`);
      throw new SlackPostError(message, errorCode);
    }

    // If body is too long, upload it as a file in a thread
    if (bodyAsFile) {
      try {
        await app.client.files.uploadV2({
          channel_id: channel,
          content: bodyAsFile.content,
          filename: bodyAsFile.filename,
          thread_ts: result.ts, // Upload file as a threaded reply
          snippet_type: 'text',
        });
      } catch (uploadError) {
        console.error('Failed to upload email body as file:', uploadError);

        // Update the original message to indicate the file upload failed
        await app.client.chat.update({
          channel,
          ts: result.ts,
          text: `${text} (Attachment failed to upload)`,
          blocks: [
            ...blocks,
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: ':warning: *Attachment failed to upload.*',
                },
              ],
            },
          ],
        });

        // Re-throw as SlackPostError to ensure the overall operation is marked as failed
        const errorMessage =
          uploadError instanceof Error
            ? uploadError.message
            : 'File upload failed';
        throw new SlackPostError(
          `Failed to upload email attachment: ${errorMessage}`,
          'file_upload_error',
        );
      }
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

/**
 * Configuration for mail sending listeners
 */
export interface MailSendingConfig {
  mailRepository: MailRepository;
  defaultSenderAddress: string;
}

/**
 * Register mail sending listeners (template and send)
 */
export function registerMailSendingListeners(
  app: App,
  config: MailSendingConfig,
): void {
  // Handle "@mailbot template" - generate and post email template
  app.message(/@mailbot\s+template/i, async ({ message, say }) => {
    try {
      const template = generateEmailTemplate();
      await say({
        text: 'Email template:',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Email Template*\n\nPlease copy this template, fill it out, and post it as a new message. Then mention me with the message URL to send the email.',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`\n${template}\`\`\``,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'After filling out the template, right-click the message → Copy link, then mention me: `@mailbot <message_url>`',
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error('Failed to generate email template:', error);
      await say({
        text: ':x: Failed to generate email template. Please try again.',
      });
    }
  });

  // Handle "@mailbot <message_url>" - fetch, parse, confirm, and send email
  app.message(
    /@mailbot\s+(https:\/\/[^\s]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+)/i,
    async ({ message, say, client }) => {
      try {
        const match = (message as { text?: string }).text?.match(
          /@mailbot\s+(https:\/\/[^\s]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+)/i,
        );

        if (!match || !match[1]) {
          await say({
            text: ':x: Could not find a valid Slack message URL. Please provide a URL in the format: `https://workspace.slack.com/archives/CHANNEL/pTIMESTAMP`',
          });
          return;
        }

        const messageUrl = match[1];

        // Parse message URL
        const { channelId, timestamp } = parseMessageUrl(messageUrl);

        // Fetch the message content
        const messageText = await fetchMessage(client, channelId, timestamp);

        // Parse the email template
        const emailData = parseEmailTemplate(messageText);

        // Use default sender if not provided
        const fromAddress = emailData.from ?? {
          address: config.defaultSenderAddress,
        };

        // Show confirmation dialog
        await say({
          text: 'Email ready to send. Please confirm:',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Email Preview*',
              },
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*From:*\n${fromAddress.name ? `${fromAddress.name} ` : ''}<${fromAddress.address}>`,
                },
                {
                  type: 'mrkdwn',
                  text: `*To:*\n${emailData.to.map((addr) => (addr.name ? `${addr.name} <${addr.address}>` : addr.address)).join('\n')}`,
                },
              ],
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Subject:*\n${emailData.subject}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Body:*\n\`\`\`\n${emailData.body.substring(0, 500)}${emailData.body.length > 500 ? '...' : ''}\n\`\`\``,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Send Email',
                  },
                  style: 'primary',
                  action_id: 'send_email_confirm',
                  value: JSON.stringify({
                    from: fromAddress,
                    to: emailData.to,
                    subject: emailData.subject,
                    body: emailData.body,
                  }),
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Cancel',
                  },
                  action_id: 'send_email_cancel',
                },
              ],
            },
          ],
        });
      } catch (error) {
        console.error('Failed to process email send request:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        await say({
          text: `:x: Failed to process email send request: ${errorMessage}`,
        });
      }
    },
  );

  // Handle "Send Email" button click
  app.action('send_email_confirm', async ({ ack, body, respond }) => {
    await ack();

    try {
      // Parse email data from button value
      const action = (body as { actions?: Array<{ value?: string }> })
        .actions?.[0];
      if (!action?.value) {
        throw new Error('Missing email data in button action');
      }

      const emailData = JSON.parse(action.value) as {
        from: { name?: string; address: string };
        to: Array<{ name?: string; address: string }>;
        subject: string;
        body: string;
      };

      // Create Email object
      const email: Email = {
        messageId: `<${Date.now()}@slackmail>`,
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        body: {
          text: emailData.body,
        },
        date: new Date(),
      };

      // Send via MailRepository
      const messageId = await config.mailRepository.sendEmail(email);

      // Confirm success
      await respond({
        text: `:white_check_mark: Email sent successfully! Message ID: ${messageId}`,
        replace_original: false,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await respond({
        text: `:x: Failed to send email: ${errorMessage}`,
        replace_original: false,
      });
    }
  });

  // Handle "Cancel" button click
  app.action('send_email_cancel', async ({ ack, respond }) => {
    await ack();
    await respond({
      text: 'Email send cancelled.',
      replace_original: false,
    });
  });
}
