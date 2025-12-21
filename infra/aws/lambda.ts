import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { stackName, tags } from './config';
import { emailBucket } from './s3';

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

// Policy: CloudWatch Logs access
export const lambdaLogsPolicy = new aws.iam.RolePolicy('lambda-logs-policy', {
  role: lambdaRole.id,
  policy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        Resource: 'arn:aws:logs:*:*:*',
      },
    ],
  }),
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
  runtime: aws.lambda.Runtime.NodeJS20dX,
  handler: 'index.handler',
  role: lambdaRole.arn,
  code: new pulumi.asset.AssetArchive({
    // Bundled by esbuild (pnpm build:lambda)
    'index.js': new pulumi.asset.FileAsset('../../aws/dist/index.js'),
  }),
  timeout: 30,
  memorySize: 256,
  environment: {
    variables: {
      NODE_ENV: stackName,
      EMAIL_BUCKET_NAME: emailBucket.bucket,
    },
  },
  tags,
});
