import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import {
  slackBotToken,
  slackChannelId,
  slackSigningSecret,
  stackName,
  tags,
} from './config';
import { emailBucket } from './s3';

// Get AWS region and account ID for constructing ARNs
const currentRegion = aws.getRegion();
const currentIdentity = aws.getCallerIdentity();

// Lambda function name (defined early for log group)
const lambdaName = 'bolt-lambda';

// CloudWatch Log Group for Lambda
export const lambdaLogGroup = new aws.cloudwatch.LogGroup('lambda-log-group', {
  name: `/aws/lambda/${lambdaName}`,
  retentionInDays: 14,
  tags,
});

// IAM role for Lambda execution
export const lambdaRole = new aws.iam.Role('lambda-role', {
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

// Policy: CloudWatch Logs access (scoped to specific log group)
export const lambdaLogsPolicy = new aws.iam.RolePolicy('lambda-logs-policy', {
  role: lambdaRole.id,
  policy: pulumi
    .all([currentRegion, currentIdentity])
    .apply(([region, identity]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: `arn:aws:logs:${region.name}:${identity.accountId}:log-group:/aws/lambda/${lambdaName}:*`,
          },
        ],
      }),
    ),
});

// Policy: S3 read access for email bucket
export const lambdaS3Policy = new aws.iam.RolePolicy('lambda-s3-policy', {
  role: lambdaRole.id,
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

// Lambda function
export const boltLambda = new aws.lambda.Function('bolt-lambda', {
  runtime: aws.lambda.Runtime.NodeJS24dX,
  handler: 'index.handler',
  role: lambdaRole.arn,
  code: new pulumi.asset.AssetArchive({
    // Bundled by esbuild (pnpm build:lambda)
    'index.js': new pulumi.asset.FileAsset('./dist/index.js'),
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
    },
  },
  tags,
});
