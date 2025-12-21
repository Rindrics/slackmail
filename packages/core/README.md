# slackmail

[![npm version](https://badge.fury.io/js/slackmail.svg)](https://www.npmjs.com/package/slackmail)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn Slack into your email client - receive and send emails directly from Slack.

## Features

- 📬 Receive emails in Slack channels
- 📧 Parse raw email content (RFC 5322)
- 🔄 Built-in retry with exponential backoff
- 🏗️ Clean architecture with pluggable storage

> **Coming Soon**: Send emails directly from Slack

## Installation

```bash
npm install slackmail
# or
pnpm add slackmail
# or
yarn add slackmail
```

## Quick Start

```typescript
import {
  createSlackApp,
  createEmailReceivedHandler,
  ReceiveMailUseCase,
  SimpleEmailParser,
} from 'slackmail';

// 1. Create Slack app
const { app } = createSlackApp({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  botToken: process.env.SLACK_BOT_TOKEN!,
  channel: process.env.SLACK_CHANNEL_ID!,
});

// 2. Create email handler
const onEmailReceived = createEmailReceivedHandler(
  app,
  process.env.SLACK_CHANNEL_ID!,
);

// 3. Create use case with your storage implementation
const useCase = new ReceiveMailUseCase({
  storageRepository: yourStorageRepository, // Implement StorageRepository interface
  emailParser: new SimpleEmailParser(),
  onEmailReceived,
});

// 4. Process email
await useCase.execute({ storageKey: 'path/to/email' });
```

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         slackmail                               │
├─────────────────────────────────────────────────────────────────┤
│  Domain Layer                                                   │
│  ├── Email entity                                               │
│  ├── EmailParser interface                                      │
│  └── StorageRepository interface                                │
├─────────────────────────────────────────────────────────────────┤
│  Application Layer                                              │
│  └── ReceiveMailUseCase                                         │
├─────────────────────────────────────────────────────────────────┤
│  Presentation Layer                                             │
│  ├── Slack App (Bolt)                                           │
│  └── Email Formatter                                            │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### `createSlackApp(config)`

Create a Slack Bolt app configured for AWS Lambda.

```typescript
const { app, receiver } = createSlackApp({
  signingSecret: string,  // Slack signing secret
  botToken: string,       // Bot user OAuth token (xoxb-...)
  channel: string,        // Default channel ID
});
```

### `createEmailReceivedHandler(app, channel, config?)`

Create a callback for handling received emails.

```typescript
const handler = createEmailReceivedHandler(app, channel, {
  maxRetries: 2,           // Default: 2
  initialBackoffMs: 1000,  // Default: 1000
  onFailure: async (record) => {
    // Handle permanently failed emails
  },
});
```

### `ReceiveMailUseCase`

Main use case for processing emails.

```typescript
const useCase = new ReceiveMailUseCase({
  storageRepository: StorageRepository,
  emailParser: EmailParser,
  onEmailReceived: (email: Email) => Promise<void>,
});

const result = await useCase.execute({ storageKey: 'path/to/email' });
// result.email contains the parsed Email object
```

### `SimpleEmailParser`

Built-in email parser for basic RFC 5322 emails.

```typescript
const parser = new SimpleEmailParser();
const email = await parser.parse(rawEmailContent);
```

> **Note**: For production use with complex MIME multipart emails, consider using [mailparser](https://www.npmjs.com/package/mailparser) and implementing the `EmailParser` interface.

### Interfaces

#### `StorageRepository`

```typescript
interface StorageRepository {
  fetchRawEmail(key: string): Promise<string>;
}
```

#### `EmailParser`

```typescript
interface EmailParser {
  parse(raw: string | Buffer): Promise<Email>;
}
```

#### `Email`

```typescript
interface Email {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  date: Date;
  inReplyTo?: string;
  references?: string[];
}

interface EmailAddress {
  name?: string;
  address: string;
}
```

## Deploy to AWS (Quick Start)

Want a complete, production-ready setup with AWS infrastructure (SES, S3, Lambda)?

👉 **Fork the [juzumaru](https://github.com/Rindrics/juzumaru) repository**

The repository includes:
- 🏗️ **Pulumi IaC** - S3, Lambda, SES, Route53, IAM
- 🔄 **GitHub Actions** - CI/CD with OIDC authentication
- 📧 **SES Email Receiving** - Receive emails at your custom domain
- 📦 **Ready to deploy** - Just configure your secrets and deploy

```bash
git clone https://github.com/Rindrics/juzumaru.git
cd juzumaru
pnpm install
# Configure your AWS and Slack credentials, then:
cd infra/aws && pnpm run up
```

See the [repository README](https://github.com/Rindrics/juzumaru#readme) for detailed setup instructions.

## Slack App Setup

1. Create a new app at [Slack API](https://api.slack.com/apps)
2. Add the following **Bot Token Scopes**:
   - `chat:write` - Post messages
   - `chat:write.public` - Post to public channels without joining
3. Install the app to your workspace
4. Note your credentials:
   - **Bot User OAuth Token** → `SLACK_BOT_TOKEN`
   - **Signing Secret** → `SLACK_SIGNING_SECRET`

## Examples

### AWS Lambda with S3

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import type { S3Handler } from 'aws-lambda';
import {
  createSlackApp,
  createEmailReceivedHandler,
  ReceiveMailUseCase,
  SimpleEmailParser,
  type StorageRepository,
} from 'slackmail';

// Implement StorageRepository for S3
class S3StorageRepository implements StorageRepository {
  constructor(
    private bucket: string,
    private client = new S3Client({}),
  ) {}

  async fetchRawEmail(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body!.transformToString();
  }
}

// Lambda handler
export const handler: S3Handler = async (event) => {
  const { app } = createSlackApp({
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    botToken: process.env.SLACK_BOT_TOKEN!,
    channel: process.env.SLACK_CHANNEL_ID!,
  });

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const useCase = new ReceiveMailUseCase({
      storageRepository: new S3StorageRepository(bucket),
      emailParser: new SimpleEmailParser(),
      onEmailReceived: createEmailReceivedHandler(app, process.env.SLACK_CHANNEL_ID!),
    });

    await useCase.execute({ storageKey: key });
  }
};
```

## License

MIT
