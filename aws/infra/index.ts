import { projectName, stackName } from "./config";
import { emailBucket } from "./s3";
import { boltLambda, lambdaRole } from "./lambda";
import { api, stage } from "./apigateway";

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
