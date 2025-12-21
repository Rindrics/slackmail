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
 * Post email to Slack channel
 */
export async function postEmailToSlack(
  app: App,
  channel: string,
  email: Email,
): Promise<string | undefined> {
  const { text, blocks } = formatEmailForSlack(email);

  const result = await app.client.chat.postMessage({
    channel,
    text,
    blocks,
  });

  return result.ts;
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
