import * as aws from '@pulumi/aws';
import { s3Lambda } from './lambda';
import { emailBucket } from './s3';

// Permission for S3 to invoke Lambda
export const s3InvokeLambdaPermission = new aws.lambda.Permission(
  's3-invoke-lambda-permission',
  {
    action: 'lambda:InvokeFunction',
    function: s3Lambda.name,
    principal: 's3.amazonaws.com',
    sourceArn: emailBucket.arn,
  },
);

// S3 bucket notification to trigger Lambda on object creation
export const bucketNotification = new aws.s3.BucketNotification(
  'email-bucket-notification',
  {
    bucket: emailBucket.id,
    lambdaFunctions: [
      {
        lambdaFunctionArn: s3Lambda.arn,
        events: ['s3:ObjectCreated:*'],
      },
    ],
  },
  {
    dependsOn: [s3InvokeLambdaPermission],
  },
);
