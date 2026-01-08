import {
  createSlackApp,
  registerMailSendingListeners,
  SendMailUseCase,
} from '@rindrics/slackmail';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Callback,
  Context,
} from 'aws-lambda';
import { SESMailRepository } from '@/infrastructure/sesMailRepository';

/**
 * Required environment variables configuration for Slack handler
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

// Initialize Slack App with receiver for API Gateway
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
 * Slack Events API handler for API Gateway requests.
 * Handles Slack challenge verification and event callbacks.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
  callback: Callback,
): Promise<APIGatewayProxyResultV2> => {
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
};
