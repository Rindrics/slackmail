import { stage } from './apigateway';
import { emailDomain, projectName, stackName } from './config';
import {
  channelConfigsTable,
  domainsTable,
  emailLogsTable,
  tenantsTable,
} from './dynamodb';
import { s3Lambda, s3LambdaRole, slackLambda, slackLambdaRole } from './lambda';
import { emailBucket } from './s3';
import { sesDomainIdentity } from './ses';
import './s3-notification'; // S3 event notification setup

// =============================================================================
// Exports
// =============================================================================

export const project = projectName;
export const stack = stackName;
export const emailBucketName = emailBucket.bucket;
export const emailBucketArn = emailBucket.arn;

// S3 Lambda (email processing)
export const s3LambdaFunctionName = s3Lambda.name;
export const s3LambdaFunctionArn = s3Lambda.arn;
export const s3LambdaRoleArn = s3LambdaRole.arn;

// Slack Lambda (API Gateway)
export const slackLambdaFunctionName = slackLambda.name;
export const slackLambdaFunctionArn = slackLambda.arn;
export const slackLambdaRoleArn = slackLambdaRole.arn;

// DynamoDB tables (multi-tenant)
export const tenantsTableName = tenantsTable.name;
export const domainsTableName = domainsTable.name;
export const channelConfigsTableName = channelConfigsTable.name;
export const emailLogsTableName = emailLogsTable.name;

export const apiEndpoint = stage.invokeUrl;
export const sesEmailDomain = emailDomain;
export const sesDomainArn = sesDomainIdentity.arn;
