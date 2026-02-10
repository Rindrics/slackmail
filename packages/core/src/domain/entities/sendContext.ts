import type { Domain, TenantConfig } from './tenantConfig';

/**
 * SendContext contains tenant and domain information needed for email sending.
 *
 * This context is passed through the use case and repository chain to ensure
 * the email is sent using the correct tenant's configuration and domain.
 */
export interface SendContext {
  // Tenant information
  tenantConfig: TenantConfig;

  // Domain information
  domain: Domain;

  // Slack context
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
}
