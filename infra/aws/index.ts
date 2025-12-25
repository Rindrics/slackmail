import { stage } from './apigateway.js';
import { emailDomain, projectName, stackName } from './config.js';
import { boltLambda, lambdaRole } from './lambda.js';
import { emailBucket } from './s3.js';
import { sesDomainIdentity } from './ses.js';
import './s3-notification.js'; // S3 event notification setup

// =============================================================================
// Exports
// =============================================================================

export const project = projectName;
export const stack = stackName;
export const emailBucketName = emailBucket.bucket;
export const emailBucketArn = emailBucket.arn;
export const lambdaFunctionName = boltLambda.name;
export const lambdaFunctionArn = boltLambda.arn;
export const lambdaRoleArn = lambdaRole.arn;
export const apiEndpoint = stage.invokeUrl;
export const sesEmailDomain = emailDomain;
export const sesDomainArn = sesDomainIdentity.arn;
