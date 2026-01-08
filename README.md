# @rindrics/slackmail

Slack-powered email client with pluggable infrastructure.

Receive emails and forward them to a Slack channel.

## Architecture

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Email     │────▶│    SES      │────▶│     S3      │────▶│   Lambda    │
│   Sender    │     │  (receive)  │     │  (storage)  │     │  (process)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                    │
                                                                    ▼
                                                            ┌─────────────┐
                                                            │   Slack     │
                                                            │  (notify)   │
                                                            └─────────────┘
```

## Prerequisites

- Node.js 24.x
- pnpm 10.x
- AWS Account with appropriate permissions
- Slack Workspace with admin access
- Domain with Route53 hosted zone (for email receiving)
- Pulumi Cloud account (for state management)

## Setup

### 1. Slack App Setup

1. Create a new app at [Slack API](https://api.slack.com/apps)

2. Add the following **Bot Token Scopes** under **OAuth & Permissions**:

| Scope | Description |
|-------|-------------|
| `chat:write` | Post messages to channels |
| `chat:write.public` | Post to public channels the bot isn't a member of |
| `files:write` | Upload, edit, and delete files (required for long emails >2800 characters) |
| `channels:history` | Read messages from public channels (for fetching email templates) |
| `groups:history` | Read messages from private channels (if using private channels) |

3. Enable **Event Subscriptions** and subscribe to the following bot events:

| Event | Description |
|-------|-------------|
| `app_mention` | Detect when the bot is mentioned (`@yourbot`) |
| `message.channels` | Listen for messages in public channels (optional) |

4. Install the app to your workspace under **Install App**

5. Note down the following credentials:
   - **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`
   - **Signing Secret** (under Basic Information) → `SLACK_SIGNING_SECRET`
   - **Channel ID** (target channel for notifications) → `SLACK_CHANNEL_ID`

> **Note**: You can get the Channel ID by right-clicking a channel in Slack → "Copy link" and extracting the last part of the URL (e.g., `C01234ABCDE`)

### Bot Commands

| Command | Description |
|---------|-------------|
| `@yourbot template` | Generate an email template to fill out |
| `@yourbot <message_url>` | Parse a message and show email send confirmation |

> **Note**: Replace `@yourbot` with your actual bot name.

#### Sending an Email

1. Mention the bot with `@yourbot template` to get a template
2. Copy the template, fill it out, and post as a new message
3. Right-click the message → Copy link
4. Mention the bot with `@yourbot <copied_url>`
5. Review the preview and click "Send Email" to send

### 2. AWS Setup

#### IAM User/Role

Required permissions for deployment:

- `s3:*` (S3 bucket management)
- `lambda:*` (Lambda function management)
- `iam:*` (IAM role/policy management)
- `ses:*` (SES configuration)
- `route53:*` (DNS records)
- `logs:*` (CloudWatch Logs)
- `apigateway:*` (API Gateway, if used)

#### GitHub Actions (OIDC)

OIDC authentication is recommended for GitHub Actions deployments:

1. Create an Identity Provider in AWS IAM:
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

2. Create an IAM Role with the following Trust Policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/slackmail:*"
        }
      }
    }
  ]
}
```

### 3. Pulumi Setup

1. Create an account at [Pulumi Cloud](https://app.pulumi.com/)
2. Generate an Access Token → `PULUMI_ACCESS_TOKEN`
3. Create a stack (e.g., `rindrics/slackmail/dev`)

### 4. Route53 Setup

1. Create a Hosted Zone for your domain (or use an existing one)
2. Note down the Zone ID → `ROUTE53_ZONE_ID`
3. Decide on the email receiving domain → `EMAIL_DOMAIN`

## Environment Variables

### Local Development

```bash
# Pulumi
export PULUMI_ACCESS_TOKEN=pul-xxxx

# AWS (for local pulumi preview/up)
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=ap-northeast-1

# Application Config
export EMAIL_DOMAIN=example.com
export ROUTE53_ZONE_ID=Z1234567890ABC

# Slack (for Lambda)
export SLACK_SIGNING_SECRET=...
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_CHANNEL_ID=C01234ABCDE
```

### GitHub Actions Secrets/Variables

| Name | Type | Description |
|------|------|-------------|
| `AWS_ROLE_ARN` | Secret | IAM Role ARN for OIDC |
| `PULUMI_ACCESS_TOKEN` | Secret | Pulumi Cloud Token |
| `ROUTE53_ZONE_ID` | Secret | Route53 Hosted Zone ID |
| `SLACK_SIGNING_SECRET` | Secret | Slack App Signing Secret |
| `SLACK_BOT_TOKEN` | Secret | Slack Bot OAuth Token |
| `EMAIL_DOMAIN` | Variable | Email receiving domain |
| `SLACK_CHANNEL_ID` | Variable | Target Slack Channel ID |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Lint and format
pnpm run check
pnpm run fix
```

### Package Structure

```text
.
├── packages/
│   └── core/           # Core business logic (domain, application, infrastructure)
└── infra/
    └── aws/            # AWS infrastructure (Pulumi) and Lambda handler
```

## Deployment

### Preview Changes

```bash
cd infra/aws
pnpm run preview
```

### Deploy

```bash
cd infra/aws
pnpm run up
```

### Destroy

```bash
cd infra/aws
pnpm run destroy
```

## Troubleshooting

### SES Sandbox Mode

New AWS accounts have SES in sandbox mode. For production use:

1. Go to AWS Console → SES → Account dashboard
2. Click "Request production access"
3. Fill in the use case and submit

### Bot Not Posting to Channel

1. Verify the bot is a member of the target channel
2. With `chat:write.public` scope, the bot can post to public channels without being a member
3. For private channels, invite the bot using `/invite @bot-name`

### Email Not Received

1. Verify MX records are correctly configured:
   ```bash
   dig MX example.com
   ```
2. Check that SES domain verification is complete
3. Verify SES Receipt Rule is enabled
4. Check Lambda CloudWatch Logs for errors

### Long Emails

Emails exceeding Slack Block Kit character limits are handled automatically:

- **Email subject** > 140 characters: Truncated with "..." ellipsis
- **Email body** > 2800 characters: Uploaded as a `.txt` file with preview

> **Note**: If you see a `missing_scope` error for long emails, ensure the `files:write` scope is added to your Slack app (see Setup → Slack App Setup).

## License

MIT
