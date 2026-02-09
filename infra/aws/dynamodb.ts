import * as aws from '@pulumi/aws';
import { tags } from './config';

/**
 * DynamoDB tables for multi-tenant support
 *
 * This module manages the following tables:
 * 1. tenants - Slack workspace configuration
 * 2. domains - Email domain configuration
 * 3. channel_configs - Channel-specific settings
 * 4. email_logs - Email sending audit trail
 */

// =============================================================================
// Tenants Table
// =============================================================================

/**
 * Table: tenants
 * Stores Slack workspace configuration
 *
 * Primary Key: team_id (Slack Team ID)
 * Attributes:
 * - team_id: Slack Team ID
 * - team_name: Workspace name
 * - bot_token: Slack Bot Token (encrypted at rest)
 * - bot_user_id: Bot User ID
 * - installed_at: ISO8601 timestamp
 * - installed_by: Slack User ID of installer
 * - plan: free | pro | enterprise
 * - status: active | suspended | deleted
 * - stripe_customer_id: For billing (optional)
 */
export const tenantsTable = new aws.dynamodb.Table('tenants', {
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'team_id',
  attributes: [
    {
      name: 'team_id',
      type: 'S',
    },
  ],
  ttl: {
    attributeName: 'ttl',
    enabled: false,
  },
  tags: {
    ...tags,
    Name: 'slackmail-tenants',
  },
});

// =============================================================================
// Domains Table
// =============================================================================

/**
 * Table: domains
 * Stores email domain configuration for each tenant
 *
 * Primary Key: domain_id (UUID)
 * Global Secondary Index: team_id
 *
 * Attributes:
 * - domain_id: UUID (primary key)
 * - team_id: Slack Team ID (GSI partition key)
 * - domain: Email domain
 * - ses_identity_arn: SES identity ARN
 * - verification_status: pending | verified | failed
 * - dkim_status: pending | verified | failed
 * - mail_from_status: pending | verified | failed
 * - default_sender: Default sender email address
 * - created_at: ISO8601 timestamp
 */
export const domainsTable = new aws.dynamodb.Table('domains', {
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'domain_id',
  rangeKey: undefined,
  attributes: [
    {
      name: 'domain_id',
      type: 'S',
    },
    {
      name: 'team_id',
      type: 'S',
    },
  ],
  globalSecondaryIndexes: [
    {
      name: 'team_id-index',
      hashKey: 'team_id',
      projectionType: 'ALL',
    },
  ],
  ttl: {
    attributeName: 'ttl',
    enabled: false,
  },
  tags: {
    ...tags,
    Name: 'slackmail-domains',
  },
});

// =============================================================================
// Channel Configs Table
// =============================================================================

/**
 * Table: channel_configs
 * Stores channel-specific configuration (which domain to use, etc.)
 *
 * Primary Key: team_id + channel_id (composite)
 *
 * Attributes:
 * - team_id: Slack Team ID (partition key)
 * - channel_id: Slack Channel ID (sort key)
 * - domain_id: Domain ID to use for this channel
 * - enabled: Boolean (whether bot is enabled in this channel)
 * - created_at: ISO8601 timestamp
 * - updated_at: ISO8601 timestamp
 */
export const channelConfigsTable = new aws.dynamodb.Table('channel_configs', {
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'team_id',
  rangeKey: 'channel_id',
  attributes: [
    {
      name: 'team_id',
      type: 'S',
    },
    {
      name: 'channel_id',
      type: 'S',
    },
  ],
  ttl: {
    attributeName: 'ttl',
    enabled: false,
  },
  tags: {
    ...tags,
    Name: 'slackmail-channel-configs',
  },
});

// =============================================================================
// Email Logs Table
// =============================================================================

/**
 * Table: email_logs
 * Stores email sending history for audit and debugging
 *
 * Primary Key: message_id (SES Message ID)
 * Global Secondary Index: team_id + sent_at
 *
 * Attributes:
 * - message_id: SES Message ID (primary key)
 * - team_id: Slack Team ID (GSI partition key)
 * - channel_id: Slack Channel ID
 * - user_id: Slack User ID (who triggered sending)
 * - from_address: Sender email address
 * - to_addresses: List of recipient addresses
 * - subject: Email subject
 * - status: sent | bounced | complained
 * - sent_at: ISO8601 timestamp (GSI sort key)
 * - ttl: TTL value for automatic deletion (90 days)
 */
export const emailLogsTable = new aws.dynamodb.Table('email_logs', {
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'message_id',
  rangeKey: undefined,
  attributes: [
    {
      name: 'message_id',
      type: 'S',
    },
    {
      name: 'team_id',
      type: 'S',
    },
    {
      name: 'sent_at',
      type: 'S',
    },
  ],
  globalSecondaryIndexes: [
    {
      name: 'team_id-sent_at-index',
      hashKey: 'team_id',
      rangeKey: 'sent_at',
      projectionType: 'ALL',
    },
  ],
  ttl: {
    attributeName: 'ttl',
    enabled: true,
  },
  tags: {
    ...tags,
    Name: 'slackmail-email-logs',
  },
});
