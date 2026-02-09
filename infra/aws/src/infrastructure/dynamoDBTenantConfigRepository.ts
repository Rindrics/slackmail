import {
  type AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type {
  ChannelConfig,
  Domain,
  EmailLog,
  TenantConfig,
  TenantConfigRepository,
} from '@rindrics/slackmail';

/**
 * DynamoDB implementation of TenantConfigRepository.
 *
 * Manages multi-tenant configuration stored in DynamoDB tables:
 * - tenants: Slack workspace configuration
 * - domains: Email domain configuration
 * - channel_configs: Channel-specific settings
 * - email_logs: Email sending audit trail
 */
export class DynamoDBTenantConfigRepository implements TenantConfigRepository {
  private readonly dynamoDBClient: DynamoDBClient;
  private readonly tenantsTableName: string;
  private readonly domainsTableName: string;
  private readonly channelConfigsTableName: string;
  private readonly emailLogsTableName: string;

  constructor(config: {
    dynamoDBClient?: DynamoDBClient;
    tenantsTableName: string;
    domainsTableName: string;
    channelConfigsTableName: string;
    emailLogsTableName: string;
  }) {
    this.dynamoDBClient = config.dynamoDBClient ?? new DynamoDBClient({});
    this.tenantsTableName = config.tenantsTableName;
    this.domainsTableName = config.domainsTableName;
    this.channelConfigsTableName = config.channelConfigsTableName;
    this.emailLogsTableName = config.emailLogsTableName;
  }

  async getTenantConfig(teamId: string): Promise<TenantConfig | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.tenantsTableName,
        Key: marshall({ team_id: teamId }),
      });

      const response = await this.dynamoDBClient.send(command);

      if (!response.Item) {
        return null;
      }

      const unmarshalled = unmarshall(response.Item) as unknown;
      return this.mapToTenantConfig(unmarshalled);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get tenant config for team ${teamId}: ${errorMessage}`,
      );
    }
  }

  async getDomainsByTeamId(teamId: string): Promise<Domain[]> {
    try {
      const command = new QueryCommand({
        TableName: this.domainsTableName,
        IndexName: 'team_id-index',
        KeyConditionExpression: 'team_id = :teamId',
        ExpressionAttributeValues: marshall({
          ':teamId': teamId,
        }),
      });

      const response = await this.dynamoDBClient.send(command);

      if (!response.Items) {
        return [];
      }

      return response.Items.map((item: Record<string, AttributeValue>) => {
        const unmarshalled = unmarshall(item) as unknown;
        return this.mapToDomain(unmarshalled);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get domains for team ${teamId}: ${errorMessage}`,
      );
    }
  }

  async getDomainById(domainId: string): Promise<Domain | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.domainsTableName,
        Key: marshall({ domain_id: domainId }),
      });

      const response = await this.dynamoDBClient.send(command);

      if (!response.Item) {
        return null;
      }

      const unmarshalled = unmarshall(response.Item) as unknown;
      return this.mapToDomain(unmarshalled);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get domain ${domainId}: ${errorMessage}`);
    }
  }

  async getChannelConfig(
    teamId: string,
    channelId: string,
  ): Promise<ChannelConfig | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.channelConfigsTableName,
        Key: marshall({ team_id: teamId, channel_id: channelId }),
      });

      const response = await this.dynamoDBClient.send(command);

      if (!response.Item) {
        return null;
      }

      const unmarshalled = unmarshall(response.Item) as unknown;
      return this.mapToChannelConfig(unmarshalled);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get channel config for ${teamId}/${channelId}: ${errorMessage}`,
      );
    }
  }

  async saveEmailLog(emailLog: EmailLog): Promise<void> {
    try {
      // Validate TTL is a positive number
      if (!Number.isInteger(emailLog.ttl) || emailLog.ttl <= 0) {
        throw new Error(
          `Invalid EmailLog: ttl must be a positive integer (Unix timestamp seconds)`,
        );
      }

      const item = {
        message_id: emailLog.messageId,
        team_id: emailLog.teamId,
        channel_id: emailLog.channelId,
        user_id: emailLog.userId,
        from_address: emailLog.fromAddress,
        to_addresses: emailLog.toAddresses,
        subject: emailLog.subject,
        status: emailLog.status,
        sent_at: emailLog.sentAt.toISOString(),
        ttl: emailLog.ttl,
      };

      const command = new PutItemCommand({
        TableName: this.emailLogsTableName,
        Item: marshall(item),
      });

      await this.dynamoDBClient.send(command);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save email log: ${errorMessage}`);
    }
  }

  async saveTenantConfig(tenantConfig: TenantConfig): Promise<void> {
    try {
      // Store tenant config in DynamoDB
      // Note: botToken is stored only by reference (ARN) to AWS Secrets Manager
      const item = {
        team_id: tenantConfig.teamId,
        team_name: tenantConfig.teamName,
        bot_user_id: tenantConfig.botUserId,
        bot_token_secret_arn: tenantConfig.botTokenSecretArn,
        plan: tenantConfig.plan,
        status: tenantConfig.status,
        installed_at: tenantConfig.installedAt.toISOString(),
        installed_by: tenantConfig.installedBy,
        ...(tenantConfig.stripeCustomerId && {
          stripe_customer_id: tenantConfig.stripeCustomerId,
        }),
      };

      const command = new PutItemCommand({
        TableName: this.tenantsTableName,
        Item: marshall(item),
      });

      await this.dynamoDBClient.send(command);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save tenant config: ${errorMessage}`);
    }
  }

  async saveDomain(domain: Domain): Promise<void> {
    try {
      const item = {
        domain_id: domain.domainId,
        team_id: domain.teamId,
        domain: domain.domain,
        ...(domain.sesIdentityArn && {
          ses_identity_arn: domain.sesIdentityArn,
        }),
        verification_status: domain.verificationStatus,
        dkim_status: domain.dkimStatus,
        mail_from_status: domain.mailFromStatus,
        default_sender: domain.defaultSender,
        created_at: domain.createdAt.toISOString(),
      };

      const command = new PutItemCommand({
        TableName: this.domainsTableName,
        Item: marshall(item),
      });

      await this.dynamoDBClient.send(command);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save domain: ${errorMessage}`);
    }
  }

  async saveChannelConfig(channelConfig: ChannelConfig): Promise<void> {
    try {
      const item = {
        team_id: channelConfig.teamId,
        channel_id: channelConfig.channelId,
        domain_id: channelConfig.domainId,
        enabled: channelConfig.enabled,
        created_at: channelConfig.createdAt.toISOString(),
        updated_at: channelConfig.updatedAt.toISOString(),
      };

      const command = new PutItemCommand({
        TableName: this.channelConfigsTableName,
        Item: marshall(item),
      });

      await this.dynamoDBClient.send(command);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save channel config: ${errorMessage}`);
    }
  }

  /**
   * Map DynamoDB item to TenantConfig domain object
   */
  private mapToTenantConfig(item: unknown): TenantConfig {
    const data = item as Record<string, unknown>;

    // Validate required fields
    const requiredFields = [
      'team_id',
      'team_name',
      'bot_user_id',
      'bot_token_secret_arn',
      'plan',
      'status',
      'installed_at',
      'installed_by',
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(
          `Invalid TenantConfig: missing required field "${field}"`,
        );
      }
    }

    // Validate and parse date
    const installedAtDate = new Date(String(data.installed_at));
    if (isNaN(installedAtDate.getTime())) {
      throw new Error(`Invalid TenantConfig: installed_at is not a valid date`);
    }

    return {
      teamId: String(data.team_id),
      teamName: String(data.team_name),
      botUserId: String(data.bot_user_id),
      botTokenSecretArn: String(data.bot_token_secret_arn),
      plan: String(data.plan) as TenantConfig['plan'],
      status: String(data.status) as TenantConfig['status'],
      installedAt: installedAtDate,
      installedBy: String(data.installed_by),
      stripeCustomerId: data.stripe_customer_id
        ? String(data.stripe_customer_id)
        : undefined,
    };
  }

  /**
   * Map DynamoDB item to Domain domain object
   */
  private mapToDomain(item: unknown): Domain {
    const data = item as Record<string, unknown>;

    // Validate required fields
    const requiredFields = [
      'domain_id',
      'team_id',
      'domain',
      'verification_status',
      'dkim_status',
      'mail_from_status',
      'default_sender',
      'created_at',
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Invalid Domain: missing required field "${field}"`);
      }
    }

    // Validate and parse date
    const createdAtDate = new Date(String(data.created_at));
    if (isNaN(createdAtDate.getTime())) {
      throw new Error(`Invalid Domain: created_at is not a valid date`);
    }

    return {
      domainId: String(data.domain_id),
      teamId: String(data.team_id),
      domain: String(data.domain),
      sesIdentityArn: data.ses_identity_arn
        ? String(data.ses_identity_arn)
        : undefined,
      verificationStatus: String(
        data.verification_status,
      ) as Domain['verificationStatus'],
      dkimStatus: String(data.dkim_status) as Domain['dkimStatus'],
      mailFromStatus: String(data.mail_from_status) as Domain['mailFromStatus'],
      defaultSender: String(data.default_sender),
      createdAt: createdAtDate,
    };
  }

  /**
   * Map DynamoDB item to ChannelConfig domain object
   */
  private mapToChannelConfig(item: unknown): ChannelConfig {
    const data = item as Record<string, unknown>;

    // Validate required fields
    const requiredFields = [
      'team_id',
      'channel_id',
      'domain_id',
      'enabled',
      'created_at',
      'updated_at',
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(
          `Invalid ChannelConfig: missing required field "${field}"`,
        );
      }
    }

    // Validate and parse dates
    const createdAtDate = new Date(String(data.created_at));
    if (isNaN(createdAtDate.getTime())) {
      throw new Error(`Invalid ChannelConfig: created_at is not a valid date`);
    }

    const updatedAtDate = new Date(String(data.updated_at));
    if (isNaN(updatedAtDate.getTime())) {
      throw new Error(`Invalid ChannelConfig: updated_at is not a valid date`);
    }

    return {
      teamId: String(data.team_id),
      channelId: String(data.channel_id),
      domainId: String(data.domain_id),
      enabled: Boolean(data.enabled),
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    };
  }

  /**
   * Calculate TTL value (Unix timestamp) for given days from now
   */
}
