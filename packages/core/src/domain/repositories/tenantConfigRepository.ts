import type {
  ChannelConfig,
  Domain,
  EmailLog,
  TenantConfig,
} from '../entities/tenantConfig';

/**
 * TenantConfigRepository interface for managing multi-tenant configuration.
 *
 * This repository abstracts the data access layer for tenant configuration,
 * allowing different implementations (DynamoDB, PostgreSQL, etc.) while
 * keeping the domain layer independent of infrastructure details.
 */
export interface TenantConfigRepository {
  /**
   * Get tenant configuration by team ID
   *
   * @param teamId - Slack Team ID
   * @returns Tenant configuration or null if not found
   * @throws {Error} If database query fails
   */
  getTenantConfig(teamId: string): Promise<TenantConfig | null>;

  /**
   * Get all domains for a tenant
   *
   * @param teamId - Slack Team ID
   * @returns Array of domain configurations
   * @throws {Error} If database query fails
   */
  getDomainsByTeamId(teamId: string): Promise<Domain[]>;

  /**
   * Get a specific domain by domain ID
   *
   * @param domainId - Domain ID
   * @returns Domain configuration or null if not found
   * @throws {Error} If database query fails
   */
  getDomainById(domainId: string): Promise<Domain | null>;

  /**
   * Get channel configuration
   *
   * @param teamId - Slack Team ID
   * @param channelId - Slack Channel ID
   * @returns Channel configuration or null if not found
   * @throws {Error} If database query fails
   */
  getChannelConfig(
    teamId: string,
    channelId: string,
  ): Promise<ChannelConfig | null>;

  /**
   * Save email log record
   *
   * @param emailLog - Email log to save
   * @throws {Error} If database write fails
   */
  saveEmailLog(emailLog: EmailLog): Promise<void>;

  /**
   * Save tenant configuration
   *
   * @param tenantConfig - Tenant configuration to save
   * @throws {Error} If database write fails
   */
  saveTenantConfig(tenantConfig: TenantConfig): Promise<void>;

  /**
   * Save domain configuration
   *
   * @param domain - Domain configuration to save
   * @throws {Error} If database write fails
   */
  saveDomain(domain: Domain): Promise<void>;

  /**
   * Save channel configuration
   *
   * @param channelConfig - Channel configuration to save
   * @throws {Error} If database write fails
   */
  saveChannelConfig(channelConfig: ChannelConfig): Promise<void>;
}
