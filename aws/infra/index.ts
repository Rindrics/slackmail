import { stage } from './apigateway';
import { projectName, stackName } from './config';
import { boltLambda, lambdaRole } from './lambda';
import { emailBucket } from './s3';
import './s3-notification'; // S3 event notification setup

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
