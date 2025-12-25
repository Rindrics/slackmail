import * as aws from '@pulumi/aws';
import { projectName, stackName, tags } from './config';

// S3 Bucket for Email Storage
export const emailBucket = new aws.s3.Bucket('email-bucket', {
  bucket: `${projectName}-${stackName}-emails`,
  forceDestroy: stackName === 'dev', // Allow destruction in dev environment
  tags,
});

// Block public access
export const emailBucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
  'email-bucket-public-access-block',
  {
    bucket: emailBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  },
);
