import type { S3Event, S3Handler } from 'aws-lambda';
import { ReceiveMailUseCase } from '@/application/receiveMailUseCase';
import { SimpleEmailParser } from '@/domain/entities/emailParser';
import { S3StorageRepository } from '@/infrastructure/s3StorageRepository';
import { createEmailReceivedHandler, createSlackApp } from '@/presentation';

// Environment variables
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '';

// Initialize Slack App (singleton)
const { app } = createSlackApp({
  signingSecret: SLACK_SIGNING_SECRET,
  botToken: SLACK_BOT_TOKEN,
  channel: SLACK_CHANNEL,
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
    const onEmailReceived = createEmailReceivedHandler(app, SLACK_CHANNEL);

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
