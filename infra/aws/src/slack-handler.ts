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
import {
  DynamoDBTenantConfigRepository,
  SESMailRepository,
} from '@/infrastructure/index';

/**
 * Required environment variables configuration for Slack handler
 */
interface EnvConfig {
  slackSigningSecret: string;
  slackBotToken: string;
  slackChannelId: string;
  tenantsTableName: string;
  domainsTableName: string;
  channelConfigsTableName: string;
  emailLogsTableName: string;
}

/**
 * Validate and load required environment variables.
 * Fails fast with clear error messages if any are missing.
 */
function loadEnvConfig(): EnvConfig {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  const slackBotToken = process.env.SLACK_BOT_TOKEN?.trim();
  const slackChannelId = process.env.SLACK_CHANNEL_ID?.trim();
  const tenantsTableName = process.env.TENANTS_TABLE_NAME?.trim();
  const domainsTableName = process.env.DOMAINS_TABLE_NAME?.trim();
  const channelConfigsTableName =
    process.env.CHANNEL_CONFIGS_TABLE_NAME?.trim();
  const emailLogsTableName = process.env.EMAIL_LOGS_TABLE_NAME?.trim();

  const missing = [];
  if (!slackSigningSecret) missing.push('SLACK_SIGNING_SECRET');
  if (!slackBotToken) missing.push('SLACK_BOT_TOKEN');
  if (!slackChannelId) missing.push('SLACK_CHANNEL_ID');
  if (!tenantsTableName) missing.push('TENANTS_TABLE_NAME');
  if (!domainsTableName) missing.push('DOMAINS_TABLE_NAME');
  if (!channelConfigsTableName) missing.push('CHANNEL_CONFIGS_TABLE_NAME');
  if (!emailLogsTableName) missing.push('EMAIL_LOGS_TABLE_NAME');

  if (missing.length > 0) {
    for (const name of missing) {
      console.error(`[Config Error] ${name} is required but not set`);
    }
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return {
    slackSigningSecret: slackSigningSecret as string,
    slackBotToken: slackBotToken as string,
    slackChannelId: slackChannelId as string,
    tenantsTableName: tenantsTableName as string,
    domainsTableName: domainsTableName as string,
    channelConfigsTableName: channelConfigsTableName as string,
    emailLogsTableName: emailLogsTableName as string,
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

// Initialize multi-tenant repositories
const tenantConfigRepository = new DynamoDBTenantConfigRepository({
  tenantsTableName: config.tenantsTableName,
  domainsTableName: config.domainsTableName,
  channelConfigsTableName: config.channelConfigsTableName,
  emailLogsTableName: config.emailLogsTableName,
});

// Initialize mail sending dependencies
const mailRepository = new SESMailRepository();

const sendMailUseCase = new SendMailUseCase(
  mailRepository,
  tenantConfigRepository,
);

// Register mail sending listeners (template and send commands)
registerMailSendingListeners(app, {
  sendMailUseCase,
  tenantConfigRepository,
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
  console.log(
    '[Slack Handler] Received event:',
    JSON.stringify(event, null, 2),
  );

  // Handle Slack URL verification challenge
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      console.log(
        '[Slack Handler] Parsed body:',
        JSON.stringify(body, null, 2),
      );

      if (body.type === 'url_verification' && body.challenge) {
        console.log('[Slack] Responding to URL verification challenge');
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/plain' },
          body: body.challenge,
        };
      }
    } catch (e) {
      console.log('[Slack Handler] Body parse error or not a challenge:', e);
    }
  }

  // Delegate to Slack Bolt receiver
  console.log('[Slack Handler] Delegating to Bolt receiver');
  const boltHandler = await receiver.start();
  const result = await boltHandler(event, context, callback);
  console.log(
    '[Slack Handler] Bolt response:',
    JSON.stringify(result, null, 2),
  );
  return result;
};
