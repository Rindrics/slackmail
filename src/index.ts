import type { S3Event, S3Handler } from 'aws-lambda';
import { ReceiveMailUseCase } from '@/application/receiveMailUseCase';
import { SimpleEmailParser } from '@/domain/entities/emailParser';
import { S3StorageRepository } from '@/infrastructure/s3StorageRepository';
import { createEmailReceivedHandler, createSlackApp } from '@/presentation';

/**
 * Required environment variables configuration
 */
interface EnvConfig {
  slackSigningSecret: string;
  slackBotToken: string;
  slackChannel: string;
}

/**
 * Validate and load required environment variables.
 * Fails fast with clear error messages if any are missing.
 */
function loadEnvConfig(): EnvConfig {
  const errors: string[] = [];

  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const slackChannel = process.env.SLACK_CHANNEL;

  if (!slackSigningSecret || slackSigningSecret.trim().length === 0) {
    errors.push('SLACK_SIGNING_SECRET is required but not set');
  }

  if (!slackBotToken || slackBotToken.trim().length === 0) {
    errors.push('SLACK_BOT_TOKEN is required but not set');
  }

  if (!slackChannel || slackChannel.trim().length === 0) {
    errors.push('SLACK_CHANNEL is required but not set');
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[Config Error] ${error}`);
    }
    throw new Error(
      `Missing required environment variables: ${errors.join(', ')}`,
    );
  }

  return {
    slackSigningSecret: slackSigningSecret!,
    slackBotToken: slackBotToken!,
    slackChannel: slackChannel!,
  };
}

// Validate environment variables at startup (fail fast)
const config = loadEnvConfig();

// Initialize Slack App (singleton)
const { app } = createSlackApp({
  signingSecret: config.slackSigningSecret,
  botToken: config.slackBotToken,
  channel: config.slackChannel,
});

/**
 * Lambda handler for S3 email events.
 * Triggered when a new email is stored in the S3 bucket.
 */
export const handler: S3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing email from s3://${bucket}/${key}`);

    const storageRepository = new S3StorageRepository(bucket);
    const emailParser = new SimpleEmailParser();
    const onEmailReceived = createEmailReceivedHandler(app, config.slackChannel);

    const useCase = new ReceiveMailUseCase({
      storageRepository,
      emailParser,
      onEmailReceived,
    });

    try {
      const result = await useCase.execute({ storageKey: key });
      console.log(`Successfully processed email: ${result.email.messageId}`);
    } catch (error) {
      console.error(`Failed to process email from ${key}:`, error);
      throw error;
    }
  }
};
