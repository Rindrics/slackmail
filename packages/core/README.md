# @rindrics/slackmail

[![npm version](https://badge.fury.io/js/@rindrics%2Fslackmail.svg)](https://badge.fury.io/js/@rindrics%2Fslackmail)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn Slack into your email client - receive and send emails directly from Slack.

## Features

- 📬 **Receive emails** in Slack channels
- 📧 **Send emails** directly from Slack with template support
- 📄 Parse raw email content (RFC 5322)
- 🔄 Built-in retry with exponential backoff
- 🏗️ Clean architecture with pluggable storage and mail repositories
- 🔐 Sender domain validation and verification
- 📎 Support for Cc/Bcc, reply threading, and file attachments

## Installation

```bash
npm install @rindrics/slackmail
# or
pnpm add @rindrics/slackmail
# or
yarn add @rindrics/slackmail
```

## Quick Start

This package provides:

1. **Slack integration** - Create a Slack app with `createSlackApp()`
2. **Email receiving** - Handle incoming emails with `ReceiveMailUseCase`
3. **Email sending** - Send emails with `SendMailUseCase`
4. **Email parsing** - Built-in `SimpleEmailParser` for RFC 5322 emails

To use, implement the `StorageRepository` interface for your storage backend and `MailRepository` for email sending, then wire them into the use cases.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    @rindrics/slackmail                          │
├─────────────────────────────────────────────────────────────────┤
│  Domain Layer                                                   │
│  ├── Email entity                                               │
│  ├── EmailAddress value object                                  │
│  ├── EmailParser interface                                      │
│  ├── StorageRepository interface                                │
│  └── MailRepository interface                                   │
├─────────────────────────────────────────────────────────────────┤
│  Application Layer                                              │
│  ├── ReceiveMailUseCase                                         │
│  └── SendMailUseCase                                            │
├─────────────────────────────────────────────────────────────────┤
│  Presentation Layer                                             │
│  ├── Slack App (Bolt)                                           │
│  ├── Email Formatter                                            │
│  ├── Email Template Parser                                      │
│  ├── Message URL Parser                                         │
│  └── Slack Message Text Parser                                  │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### Core Exports

- `createSlackApp(config)` - Create a Slack app configured for Lambda
- `createEmailReceivedHandler(app, channel, config?)` - Handler callback for received emails
- `ReceiveMailUseCase` - Use case for processing received emails
- `SendMailUseCase` - Use case for sending emails
- `SimpleEmailParser` - Built-in RFC 5322 email parser

For detailed API reference, see the [main repository documentation](https://github.com/Rindrics/slackmail).

## Key Interfaces

- **`StorageRepository`** - Implement to fetch raw emails from your storage backend
- **`MailRepository`** - Implement to send emails through your provider (e.g., AWS SES)
- **`EmailParser`** - Implement to parse emails in custom formats
- **`Email`** - Domain entity representing an email with metadata and content

For implementation details and TypeScript types, see the source code or [main repository](https://github.com/Rindrics/slackmail).

## Infrastructure Setup

To build a Slack-powered email service with email sending/receiving:

### Required Setup

1. **Slack App** - Create at [Slack API](https://api.slack.com/apps) with scopes:
   - `chat:write`, `chat:write.public` - Send messages
   - `app_mention`, `channels:history`, `groups:history` - Read messages
   - `files:write` - Upload files

2. **Email Infrastructure** - AWS SES + S3 + Lambda, or your own implementation
3. **Repository Implementations** - Implement `StorageRepository` and `MailRepository` interfaces

### Getting Started with AWS

For a complete, production-ready setup with Pulumi IaC:

👉 **See [infra/aws/README.md](https://github.com/Rindrics/slackmail/blob/main/infra/aws/README.md)** for:
- Environment variable configuration
- AWS SES domain setup
- Pulumi deployment instructions
- Infrastructure as Code examples

Or fork the full [Rindrics/slackmail](https://github.com/Rindrics/slackmail) repository.

## License

MIT
