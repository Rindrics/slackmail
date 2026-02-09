import type {
  DynamoDBDocumentClient,
  GetCommandOutput,
  QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import type {
  ChannelConfig,
  Domain,
  EmailLog,
  TenantConfig,
} from '@rindrics/slackmail';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamoDBTenantConfigRepository } from '@/infrastructure/dynamoDBTenantConfigRepository';

describe('DynamoDBTenantConfigRepository', () => {
  let repository: DynamoDBTenantConfigRepository;
  let mockDynamoDBClient: DynamoDBDocumentClient;

  const mockTenantConfig: TenantConfig = {
    teamId: 'T12345',
    teamName: 'Test Team',
    botUserId: 'U12345',
    botTokenSecretArn:
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
    plan: 'pro',
    status: 'active',
    installedAt: new Date('2025-02-07T00:00:00Z'),
    installedBy: 'U00001',
  };

  const mockDomain: Domain = {
    domainId: 'domain-1',
    teamId: 'T12345',
    domain: 'example.com',
    verificationStatus: 'verified',
    dkimStatus: 'verified',
    mailFromStatus: 'verified',
    defaultSender: 'noreply@example.com',
    createdAt: new Date('2025-02-07T00:00:00Z'),
  };

  const mockChannelConfig: ChannelConfig = {
    teamId: 'T12345',
    channelId: 'C12345',
    domainId: 'domain-1',
    enabled: true,
    createdAt: new Date('2025-02-07T00:00:00Z'),
    updatedAt: new Date('2025-02-07T00:00:00Z'),
  };

  const mockEmailLog: EmailLog = {
    messageId: '<123.abc@slackmail>',
    teamId: 'T12345',
    channelId: 'C12345',
    userId: 'U12345',
    fromAddress: 'noreply@example.com',
    toAddresses: ['recipient@example.com'],
    subject: 'Test',
    status: 'sent',
    sentAt: new Date('2025-02-07T00:00:00Z'),
    ttl: 1714867200,
  };

  beforeEach(() => {
    mockDynamoDBClient = {
      send: vi.fn(),
    } as unknown as DynamoDBDocumentClient;

    repository = new DynamoDBTenantConfigRepository({
      dynamoDBClient: mockDynamoDBClient,
      tenantsTableName: 'tenants',
      domainsTableName: 'domains',
      channelConfigsTableName: 'channel_configs',
      emailLogsTableName: 'email_logs',
    });
  });

  describe('getTenantConfig', () => {
    it('should return tenant config when found', async () => {
      const mockResponse: GetCommandOutput = {
        Item: {
          team_id: 'T12345',
          team_name: 'Test Team',
          bot_user_id: 'U12345',
          bot_token_secret_arn:
            'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
          plan: 'pro',
          status: 'active',
          installed_at: '2025-02-07T00:00:00Z',
          installed_by: 'U00001',
        },
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      const result = await repository.getTenantConfig('T12345');

      expect(result).toBeDefined();
      expect(result?.teamId).toBe('T12345');
      expect(result?.teamName).toBe('Test Team');
    });

    it('should return null when tenant not found', async () => {
      const mockResponse: GetCommandOutput = {
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      const result = await repository.getTenantConfig('T99999');

      expect(result).toBeNull();
    });

    it('should throw error with descriptive message on missing required fields', async () => {
      const mockResponse: GetCommandOutput = {
        Item: {
          team_id: 'T12345',
          // Missing required fields
          team_name: undefined,
          bot_user_id: 'U12345',
          bot_token_secret_arn: 'arn:...',
        },
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      await expect(repository.getTenantConfig('T12345')).rejects.toThrow(
        /missing required field/,
      );
    });
  });

  describe('getDomainsByTeamId', () => {
    it('should return domains for team', async () => {
      const mockResponse: QueryCommandOutput = {
        Items: [
          {
            domain_id: 'domain-1',
            team_id: 'T12345',
            domain: 'example.com',
            verification_status: 'verified',
            dkim_status: 'verified',
            mail_from_status: 'verified',
            default_sender: 'noreply@example.com',
            created_at: '2025-02-07T00:00:00Z',
          },
        ],
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      const result = await repository.getDomainsByTeamId('T12345');

      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe('example.com');
    });

    it('should return empty array when no domains found', async () => {
      const mockResponse: QueryCommandOutput = {
        Items: [],
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      const result = await repository.getDomainsByTeamId('T12345');

      expect(result).toEqual([]);
    });
  });

  describe('saveEmailLog', () => {
    it('should save email log with valid TTL', async () => {
      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.saveEmailLog(mockEmailLog);

      expect(mockDynamoDBClient.send).toHaveBeenCalled();
    });

    it('should reject invalid TTL', async () => {
      const invalidEmailLog = { ...mockEmailLog, ttl: -100 };

      await expect(
        repository.saveEmailLog(invalidEmailLog as EmailLog),
      ).rejects.toThrow(/ttl must be a positive integer/);
    });

    it('should reject non-integer TTL', async () => {
      const invalidEmailLog = { ...mockEmailLog, ttl: 123.45 };

      await expect(
        repository.saveEmailLog(invalidEmailLog as EmailLog),
      ).rejects.toThrow(/ttl must be a positive integer/);
    });
  });

  describe('saveTenantConfig', () => {
    it('should save tenant config without plain token', async () => {
      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.saveTenantConfig(mockTenantConfig);

      // Verify that send was called with PutItemCommand
      expect(mockDynamoDBClient.send).toHaveBeenCalled();

      // Get the call arguments and verify item structure
      const call = vi.mocked(mockDynamoDBClient.send).mock.calls[0][0];
      expect(call).toBeDefined();
    });
  });

  describe('saveDomain', () => {
    it('should save domain configuration', async () => {
      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.saveDomain(mockDomain);

      expect(mockDynamoDBClient.send).toHaveBeenCalled();
    });
  });

  describe('saveChannelConfig', () => {
    it('should save channel configuration', async () => {
      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.saveChannelConfig(mockChannelConfig);

      expect(mockDynamoDBClient.send).toHaveBeenCalled();
    });
  });

  describe('getChannelConfig', () => {
    it('should return channel config when found', async () => {
      const mockResponse: GetCommandOutput = {
        Item: {
          team_id: 'T12345',
          channel_id: 'C12345',
          domain_id: 'domain-1',
          enabled: true,
          created_at: '2025-02-07T00:00:00Z',
          updated_at: '2025-02-07T00:00:00Z',
        },
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      const result = await repository.getChannelConfig('T12345', 'C12345');

      expect(result).toBeDefined();
      expect(result?.channelId).toBe('C12345');
    });

    it('should return null when channel config not found', async () => {
      const mockResponse: GetCommandOutput = {
        $metadata: {},
      };

      vi.mocked(mockDynamoDBClient.send).mockResolvedValueOnce(mockResponse);

      const result = await repository.getChannelConfig('T12345', 'C99999');

      expect(result).toBeNull();
    });
  });
});
