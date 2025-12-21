import * as aws from '@pulumi/aws';
import { projectName, stackName, tags } from './config';
import { boltLambda } from './lambda';

// API Gateway for Slack webhook endpoint
export const api = new aws.apigatewayv2.Api('slack-webhook-api', {
  name: `${projectName}-${stackName}-slack-webhook`,
  protocolType: 'HTTP',
  tags,
});

// Lambda integration
export const lambdaIntegration = new aws.apigatewayv2.Integration(
  'lambda-integration',
  {
    apiId: api.id,
    integrationType: 'AWS_PROXY',
    integrationUri: boltLambda.invokeArn,
    payloadFormatVersion: '2.0',
  },
);

// Route: POST /slack/events (Slack Events API)
export const slackEventsRoute = new aws.apigatewayv2.Route(
  'slack-events-route',
  {
    apiId: api.id,
    routeKey: 'POST /slack/events',
    target: lambdaIntegration.id.apply((id) => `integrations/${id}`),
  },
);

// Default stage with auto-deploy
export const stage = new aws.apigatewayv2.Stage('default-stage', {
  apiId: api.id,
  name: '$default',
  autoDeploy: true,
  tags,
});

// Permission for API Gateway to invoke Lambda
export const lambdaPermission = new aws.lambda.Permission(
  'api-gateway-lambda-permission',
  {
    action: 'lambda:InvokeFunction',
    function: boltLambda.name,
    principal: 'apigateway.amazonaws.com',
    sourceArn: api.executionArn.apply((arn) => `${arn}/*/*`),
  },
);
