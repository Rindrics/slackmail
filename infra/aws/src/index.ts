/**
 * Lambda handlers entry point
 *
 * This module re-exports handlers from dedicated files:
 * - s3Handler: Handles S3 events for email processing
 * - slackHandler: Handles API Gateway events for Slack interactions
 */

// Re-export S3 handler for email processing
// Default export for backwards compatibility with tests
// Note: In production, use separate Lambda functions with dedicated handlers
export {
  BatchProcessingError,
  handler as s3Handler,
  handler,
} from './s3-handler';
// Re-export Slack handler for API Gateway
export { handler as slackHandler } from './slack-handler';
