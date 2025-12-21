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
    invalid_auth: 'Invalid Slack bot token. Please check SLACK_BOT_TOKEN.',
    channel_not_found: 'Slack channel not found. Please check SLACK_CHANNEL.',
    not_in_channel: 'Bot is not a member of the channel. Please invite the bot.',
    is_archived: 'The channel has been archived.',
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
    const slackError = error as { code?: string; message?: string };
    const errorCode = slackError.code || 'unknown_error';
    const message = getSlackErrorMessage(errorCode);
    console.error(`postEmailToSlack exception: ${message}`, error);
    throw new SlackPostError(message, errorCode);
  }
}

/**
 * Create onEmailReceived callback for ReceiveMailUseCase
 */
export function createEmailReceivedHandler(
  app: App,
  channel: string,
): (email: Email) => Promise<void> {
  return async (email: Email) => {
    await postEmailToSlack(app, channel, email);
  };
}
