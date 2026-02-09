/**
 * TenantConfig represents the configuration for a Slack workspace (tenant)
 * and its associated email domains.
 *
 * ⚠️ Security Note: botTokenSecretArn is stored only as a reference to AWS Secrets Manager.
 * The actual bot token is never stored in DynamoDB. Always fetch the token from Secrets Manager
 * at runtime using the ARN.
 */
export interface TenantConfig {
  // Tenant identification
  teamId: string;
  teamName: string;
  botUserId: string;

  // Slack bot credentials (stored in AWS Secrets Manager)
  botTokenSecretArn: string;

  // Tenant status and plan
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'deleted';

  // Metadata
  installedAt: Date;
  installedBy: string;

  // Optional billing
  stripeCustomerId?: string;
}

/**
 * Domain represents an email domain configuration for a tenant
 */
export interface Domain {
  // Identification
  domainId: string;
  teamId: string;
  domain: string;

  // SES verification status
  sesIdentityArn?: string;
  verificationStatus: 'pending' | 'verified' | 'failed';
  dkimStatus: 'pending' | 'verified' | 'failed';
  mailFromStatus: 'pending' | 'verified' | 'failed';

  // Sending configuration
  defaultSender: string;

  // Metadata
  createdAt: Date;
}

/**
 * ChannelConfig represents channel-specific configuration
 */
export interface ChannelConfig {
  // Identification
  teamId: string;
  channelId: string;
  domainId: string;

  // Configuration
  enabled: boolean;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * EmailLog represents a record of a sent email for auditing
 */
export interface EmailLog {
  // Identification
  messageId: string;
  teamId: string;

  // Channel and user
  channelId: string;
  userId: string;

  // Email details
  fromAddress: string;
  toAddresses: string[];
  subject: string;

  // Status and timestamps
  status: 'sent' | 'bounced' | 'complained';
  sentAt: Date;

  // TTL for automatic deletion (in Unix timestamp seconds)
  ttl?: number;
}
