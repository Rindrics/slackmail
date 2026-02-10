import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import {
  emailDomain,
  sentryDsn,
  slackBotToken,
  slackChannelId,
  slackSigningSecret,
  stackName,
  tags,
} from './config';
import {
  channelConfigsTable,
  domainsTable,
  emailLogsTable,
  tenantsTable,
} from './dynamodb';
import { emailBucket } from './s3';
import { sesDomainIdentity } from './ses';

// Get AWS region and account ID for constructing ARNs
const currentRegion = aws.getRegion();
const currentIdentity = aws.getCallerIdentity();

// =============================================================================
// S3 Lambda (Email Processing)
// =============================================================================

const s3LambdaName = 'slackmail-s3-handler';

// CloudWatch Log Group for S3 Lambda
export const s3LambdaLogGroup = new aws.cloudwatch.LogGroup(
  's3-lambda-log-group',
  {
    name: `/aws/lambda/${s3LambdaName}`,
    retentionInDays: 14,
    tags,
  },
);

// IAM role for S3 Lambda execution
export const s3LambdaRole = new aws.iam.Role('s3-lambda-role', {
  assumeRolePolicy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: {
          Service: 'lambda.amazonaws.com',
        },
        Effect: 'Allow',
      },
    ],
  }),
  tags,
});

// Policy: CloudWatch Logs access for S3 Lambda
export const s3LambdaLogsPolicy = new aws.iam.RolePolicy(
  's3-lambda-logs-policy',
  {
    role: s3LambdaRole.id,
    policy: pulumi
      .all([currentRegion, currentIdentity])
      .apply(([region, identity]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              Resource: `arn:aws:logs:${region.name}:${identity.accountId}:log-group:/aws/lambda/${s3LambdaName}:*`,
            },
          ],
        }),
      ),
  },
);

// Policy: S3 read access for email bucket
export const s3LambdaS3Policy = new aws.iam.RolePolicy('s3-lambda-s3-policy', {
  role: s3LambdaRole.id,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject"
        ],
        "Resource": "${emailBucket.arn}/*"
      }
    ]
  }`,
});

// S3 Lambda function (email processing)
export const s3Lambda = new aws.lambda.Function('s3-lambda', {
  name: s3LambdaName,
  runtime: aws.lambda.Runtime.NodeJS22dX,
  handler: 's3-handler.handler',
  role: s3LambdaRole.arn,
  code: new pulumi.asset.AssetArchive({
    's3-handler.js': new pulumi.asset.FileAsset('./dist/s3-handler.js'),
  }),
  timeout: 30,
  memorySize: 256,
  environment: {
    variables: {
      NODE_ENV: stackName,
      EMAIL_BUCKET_NAME: emailBucket.bucket,
      SLACK_SIGNING_SECRET: slackSigningSecret,
      SLACK_BOT_TOKEN: slackBotToken,
      SLACK_CHANNEL_ID: slackChannelId,
      SENTRY_DSN: sentryDsn,
    },
  },
  tags,
});

// =============================================================================
// Slack Lambda (API Gateway / Slack Events)
// =============================================================================

const slackLambdaName = 'slackmail-slack-handler';

// CloudWatch Log Group for Slack Lambda
export const slackLambdaLogGroup = new aws.cloudwatch.LogGroup(
  'slack-lambda-log-group',
  {
    name: `/aws/lambda/${slackLambdaName}`,
    retentionInDays: 14,
    tags,
  },
);

// IAM role for Slack Lambda execution
export const slackLambdaRole = new aws.iam.Role('slack-lambda-role', {
  assumeRolePolicy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: {
          Service: 'lambda.amazonaws.com',
        },
        Effect: 'Allow',
      },
    ],
  }),
  tags,
});

// Policy: CloudWatch Logs access for Slack Lambda
export const slackLambdaLogsPolicy = new aws.iam.RolePolicy(
  'slack-lambda-logs-policy',
  {
    role: slackLambdaRole.id,
    policy: pulumi
      .all([currentRegion, currentIdentity])
      .apply(([region, identity]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              Resource: `arn:aws:logs:${region.name}:${identity.accountId}:log-group:/aws/lambda/${slackLambdaName}:*`,
            },
          ],
        }),
      ),
  },
);

// Policy: SES send email access for Slack Lambda
// Allow sending from domain identity and any email address under that domain
export const slackLambdaSesPolicy = new aws.iam.RolePolicy(
  'slack-lambda-ses-policy',
  {
    role: slackLambdaRole.id,
    policy: pulumi
      .all([sesDomainIdentity.arn, currentRegion, currentIdentity])
      .apply(([domainArn, region, identity]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['ses:SendEmail', 'ses:SendRawEmail'],
              Resource: [
                // Domain identity
                domainArn,
                // Email address identities under this domain
                `arn:aws:ses:${region.name}:${identity.accountId}:identity/*`,
              ],
            },
          ],
        }),
      ),
  },
);

// Policy: DynamoDB access for Slack Lambda (multi-tenant configuration)
// Allow reading tenant, domain, and channel config, and writing email logs
export const slackLambdaDynamoDBPolicy = new aws.iam.RolePolicy(
  'slack-lambda-dynamodb-policy',
  {
    role: slackLambdaRole.id,
    policy: pulumi
      .all([
        tenantsTable.arn,
        domainsTable.arn,
        channelConfigsTable.arn,
        emailLogsTable.arn,
      ])
      .apply(([tenantsArn, domainsArn, channelConfigsArn, emailLogsArn]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['dynamodb:GetItem', 'dynamodb:Query'],
              Resource: [
                tenantsArn,
                domainsArn,
                channelConfigsArn,
                `${domainsArn}/index/team_id-index`,
              ],
            },
            {
              Effect: 'Allow',
              Action: ['dynamodb:PutItem'],
              Resource: [emailLogsArn],
            },
          ],
        }),
      ),
  },
);

// Slack Lambda function (API Gateway / Slack events)
export const slackLambda = new aws.lambda.Function('slack-lambda', {
  name: slackLambdaName,
  runtime: aws.lambda.Runtime.NodeJS22dX,
  handler: 'slack-handler.handler',
  role: slackLambdaRole.arn,
  code: new pulumi.asset.AssetArchive({
    'slack-handler.js': new pulumi.asset.FileAsset('./dist/slack-handler.js'),
  }),
  timeout: 30,
  memorySize: 256,
  environment: {
    variables: {
      NODE_ENV: stackName,
      EMAIL_DOMAIN: emailDomain,
      SLACK_SIGNING_SECRET: slackSigningSecret,
      SLACK_BOT_TOKEN: slackBotToken,
      SLACK_CHANNEL_ID: slackChannelId,
      // Multi-tenant DynamoDB tables
      TENANTS_TABLE_NAME: tenantsTable.name,
      DOMAINS_TABLE_NAME: domainsTable.name,
      CHANNEL_CONFIGS_TABLE_NAME: channelConfigsTable.name,
      EMAIL_LOGS_TABLE_NAME: emailLogsTable.name,
    },
  },
  tags,
});

// =============================================================================
// Backwards compatibility exports
// =============================================================================

// Export for backwards compatibility (used by existing code)
export const boltLambda = slackLambda;
export const lambdaRole = s3LambdaRole;
export const lambdaLogGroup = s3LambdaLogGroup;
