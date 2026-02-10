# AWS Infrastructure for @rindrics/slackmail

This package contains the AWS infrastructure and Lambda implementations for the Slackmail email client using Pulumi (Infrastructure as Code).

## Architecture

```
Email Sender → SES (receive) → S3 (email bucket) → S3 Event → S3 Lambda → Slack Channel
Slack User → API Gateway → Slack Lambda → SES (send) → Email Recipients
```

**Components**:
- **S3 Bucket** - Store received emails
- **SES** - Email sending/receiving with verified domain
- **Lambda Functions**:
  - `s3-handler` - Process incoming emails from S3, format and post to Slack
  - `slack-handler` - Handle Slack events (slash commands, app mentions) and send emails via SES
- **API Gateway** - HTTP endpoint for Slack Events API
- **IAM Roles & Policies** - Least-privilege access for Lambda functions

## Setup

### 1. Prerequisites

- **AWS Account** with appropriate permissions
- **Pulumi** installed and configured (`npm install -g pulumi`)
- **pnpm** for package management
- **Slack Workspace** with a custom app (see [core README](../packages/core/README.md))

### 2. Environment Configuration

Create a `.envrc` file (or export environment variables):

```bash
# Slack configuration (required for Lambda)
export SLACK_SIGNING_SECRET="xoxc-..."           # From Slack API dashboard
export SLACK_BOT_TOKEN="xoxb-..."                # From Slack API dashboard
export SLACK_CHANNEL_ID="C0123456789"            # Target channel ID

# Email domain (required for Lambda)
export EMAIL_DOMAIN="example.com"                # Must be SES verified
export ROUTE53_ZONE_ID="Z1234567890ABC"         # Route53 hosted zone ID (optional, for MX setup)

# Optional: Error tracking
export SENTRY_DSN=""                             # Sentry error tracking URL
```

**Note**: AWS authentication is needed for **Pulumi deployment** on your machine or in CI/CD. Methods include:
- Local: `aws configure` (IAM user credentials)
- Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- IAM roles: EC2, ECS, or container credentials
- OIDC: GitHub Actions (see `.github/workflows/deploy.yml`)

### 3. SES Domain Verification

Before deploying, verify your email domain with AWS SES:

1. Go to **AWS SES** → **Verified Identities**
2. Add your domain (e.g., `example.com`)
3. AWS provides DNS records to add to your domain registrar:
   - **CNAME records** for domain verification
   - **MX record** to route incoming emails to SES (optional, auto-configured by Pulumi)
4. Wait for verification (usually 5-30 minutes)

Once verified, SES allows:
- Receiving emails sent to `*@example.com` → S3
- Sending emails from `noreply@example.com` (or any address under the domain)

### 4. Deploy Infrastructure

```bash
# Install dependencies
pnpm install

# Preview infrastructure changes (dry-run)
pnpm run preview

# Deploy to AWS
pnpm run up

# View deployed outputs
pulumi stack output

# Destroy infrastructure (careful!)
pnpm run destroy
```

After deployment, you'll get:
- **API Endpoint** - Configure this as the Slack Events API Request URL
- **S3 Bucket** - Where received emails are stored
- **Lambda ARNs** - For monitoring and debugging

### 5. Slack App Configuration

1. Go to **[Slack API Dashboard](https://api.slack.com/apps)**
2. Select your app
3. **Event Subscriptions** → Request URL:
   - Enter the **API Endpoint** from Pulumi output
   - Slack will verify the URL by sending a challenge to `slack-handler` Lambda
4. **Subscribe to Bot Events**:
   - `app_mention` - Detect mentions of your bot
   - `message.im` - Direct messages (optional)

## Environment Variables Reference

**Lambda Environment Variables** (configure in `.envrc` before deploying):

| Variable | Required | Description |
| --- | --- | --- |
| `SLACK_SIGNING_SECRET` | ✅ | Slack app signing secret (verify webhook authenticity) |
| `SLACK_BOT_TOKEN` | ✅ | Bot user OAuth token (post messages to Slack) |
| `SLACK_CHANNEL_ID` | ✅ | Default channel to post emails to |
| `EMAIL_DOMAIN` | ✅ | Email domain (must be SES verified) |
| `ROUTE53_ZONE_ID` | ❌ | Route53 hosted zone ID (auto-configure MX records) |
| `SENTRY_DSN` | ❌ | Sentry error tracking (optional) |

**AWS Credentials** (for Pulumi deployment, not Lambda):
- Configure via `aws configure` or environment variables
- Required on your machine or in CI/CD pipeline

## Lambda Functions

### S3 Handler (`src/s3-handler.ts`)

**Trigger**: S3 bucket receives email (via SES)

**Workflow**:
1. S3 event notification → S3 Lambda
2. Fetch raw email from S3
3. Parse email (extract From, To, Subject, Body)
4. Format email as Slack message
5. Post to Slack channel

**Environment Variables**:
- `EMAIL_BUCKET_NAME` - S3 bucket name
- `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_SIGNING_SECRET`
- `SENTRY_DSN` (optional)

### Slack Handler (`src/slack-handler.ts`)

**Trigger**: API Gateway receives webhook event from Slack

**Features**:
- URL verification challenge response
- Bot mention detection
- Email template parsing from Slack messages
- Email sending via SES

**Workflow**:
1. Slack sends event/command via API Gateway
2. Validate Slack signature
3. Parse email template or message
4. Create email (To, From, Subject, Body)
5. Send via SES
6. Return confirmation to Slack

**Environment Variables**:
- `EMAIL_DOMAIN` - Domain for sender validation
- `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_SIGNING_SECRET`
- `SENTRY_DSN` (optional)

## Building & Testing

```bash
# Build TypeScript
pnpm run build

# Build Lambda bundles (esbuild)
pnpm run build:lambda

# Run tests
pnpm run test

# Watch mode
pnpm run test:watch
```

## Troubleshooting

### Slack URL Verification Fails

The Slack handler must respond to the challenge within 3 seconds.

- Check Lambda timeout (should be 30s minimum)
- Verify `SLACK_SIGNING_SECRET` is correct
- Check CloudWatch logs: `/aws/lambda/slackmail-slack-handler`

### Email Not Sent

- Verify `EMAIL_DOMAIN` is SES verified
- Check sender address matches domain (e.g., `noreply@example.com` requires `example.com` verified)
- Check SES Sandbox status (might have sending restrictions)
- View Lambda logs in CloudWatch

### Email Not Received

- Verify SES domain identity (inbound enabled)
- Check S3 bucket exists and has proper permissions
- Check S3 bucket notification to Lambda is configured
- Verify MX records point to SES (if using Route53)

## Structure

```
infra/aws/
├── src/
│   ├── slack-handler.ts        # Slack API event handler & email sending
│   ├── s3-handler.ts           # S3 email processing handler
│   ├── infrastructure/
│   │   ├── sesMailRepository.ts   # SES email sending implementation
│   │   └── ...
│   └── lambda/
│       └── (deprecated, use handlers above)
├── config.ts                   # Pulumi configuration loader
├── lambda.ts                   # Lambda function definitions
├── apigateway.ts              # API Gateway configuration
├── s3.ts                      # S3 bucket setup
├── ses.ts                     # SES domain identity
├── s3-notification.ts         # S3 → Lambda event notification
├── index.ts                   # Pulumi stack entrypoint
├── Pulumi.yaml               # Pulumi project config
└── package.json              # Dependencies
```

## Development

### Local Testing

To test Lambda handlers locally, use AWS SAM CLI or Pulumi's local testing:

```bash
# Preview changes (no deployment)
pnpm run preview

# Deploy to dev stack
pnpm run up --stack dev
```

### CI/CD

GitHub Actions automatically deploys on push to `main` branch. Configure these secrets:
- `PULUMI_ACCESS_TOKEN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_CHANNEL_ID`
- `EMAIL_DOMAIN`

See `.github/workflows/deploy.yml` for details.

## Costs

AWS SES is free tier for the first 200 emails/day. After that:
- SES sending: $0.10 per 1,000 emails
- Lambda: ~$0.20 per million invocations
- S3: ~$0.023 per GB storage + $0.0004 per request

See [AWS Pricing Calculator](https://calculator.aws/) for estimates.

## References

- [Pulumi AWS Docs](https://www.pulumi.com/registry/packages/aws/)
- [AWS SES Docs](https://docs.aws.amazon.com/ses/)
- [AWS Lambda Docs](https://docs.aws.amazon.com/lambda/)
- [Slack API Docs](https://api.slack.com/)
