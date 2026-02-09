import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SendMailContext,
  type SendMailInput,
  SendMailUseCase,
} from '@/application/usecases/sendMailUseCase';
import type { Domain, TenantConfig } from '@/domain/entities';
import type { MailRepository } from '@/domain/repositories/mailRepository';
import type { TenantConfigRepository } from '@/domain/repositories/tenantConfigRepository';

describe('SendMailUseCase', () => {
  let useCase: SendMailUseCase;
  let mockMailRepository: MailRepository;
  let mockTenantConfigRepository: TenantConfigRepository;

  const mockTenantConfig: TenantConfig = {
    teamId: 'T12345',
    teamName: 'Test Workspace',
    botUserId: 'U12345',
    botToken: 'xoxb-test',
    plan: 'pro',
    status: 'active',
    installedAt: new Date(),
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
    createdAt: new Date(),
  };

  const validInput: SendMailInput = {
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'recipient@example.com', name: 'Recipient' }],
    subject: 'Test Email',
    body: {
      text: 'This is a test email.',
    },
  };

  const validContext: SendMailContext = {
    slackTeamId: 'T12345',
    slackChannelId: 'C12345',
    slackUserId: 'U12345',
  };

  beforeEach(() => {
    mockMailRepository = {
      sendEmail: vi.fn().mockResolvedValue('test-message-id-12345'),
    };

    mockTenantConfigRepository = {
      getTenantConfig: vi.fn().mockResolvedValue(mockTenantConfig),
      getDomainsByTeamId: vi.fn().mockResolvedValue([mockDomain]),
      getDomainById: vi.fn().mockResolvedValue(mockDomain),
      getChannelConfig: vi.fn().mockResolvedValue(null),
      saveEmailLog: vi.fn().mockResolvedValue(undefined),
      saveTenantConfig: vi.fn().mockResolvedValue(undefined),
      saveDomain: vi.fn().mockResolvedValue(undefined),
      saveChannelConfig: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new SendMailUseCase(
      mockMailRepository,
      mockTenantConfigRepository,
    );
  });

  describe('execute', () => {
    it('should send email successfully', async () => {
      const result = await useCase.execute(validInput, validContext);

      expect(result.messageId).toBe('test-message-id-12345');
      expect(mockMailRepository.sendEmail).toHaveBeenCalledOnce();
      expect(mockMailRepository.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: validInput.from,
          to: validInput.to,
          subject: validInput.subject,
          body: validInput.body,
        }),
        expect.objectContaining({
          tenantConfig: mockTenantConfig,
          domain: mockDomain,
          slackTeamId: validContext.slackTeamId,
          slackChannelId: validContext.slackChannelId,
          slackUserId: validContext.slackUserId,
        }),
      );
    });

    it('should load tenant config from repository', async () => {
      await useCase.execute(validInput, validContext);

      expect(mockTenantConfigRepository.getTenantConfig).toHaveBeenCalledWith(
        'T12345',
      );
    });

    it('should throw error if tenant config not found', async () => {
      vi.mocked(mockTenantConfigRepository.getTenantConfig).mockResolvedValue(
        null,
      );

      await expect(useCase.execute(validInput, validContext)).rejects.toThrow(
        'Tenant configuration not found',
      );
    });

    it('should throw error if no domains configured for tenant', async () => {
      vi.mocked(
        mockTenantConfigRepository.getDomainsByTeamId,
      ).mockResolvedValue([]);

      await expect(useCase.execute(validInput, validContext)).rejects.toThrow(
        'No email domains configured',
      );
    });

    it('should throw error if selected domain not found', async () => {
      const contextWithDomainId: SendMailContext = {
        ...validContext,
        selectedDomainId: 'non-existent-domain',
      };

      await expect(
        useCase.execute(validInput, contextWithDomainId),
      ).rejects.toThrow('Domain non-existent-domain not found');
    });

    it('should use selected domain if specified', async () => {
      const domain2: Domain = {
        ...mockDomain,
        domainId: 'domain-2',
        domain: 'other.com',
      };

      vi.mocked(
        mockTenantConfigRepository.getDomainsByTeamId,
      ).mockResolvedValue([mockDomain, domain2]);

      const contextWithDomainId: SendMailContext = {
        ...validContext,
        selectedDomainId: 'domain-2',
      };

      await useCase.execute(validInput, contextWithDomainId);

      expect(mockMailRepository.sendEmail).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          domain: domain2,
        }),
      );
    });

    it('should use first domain if not specified', async () => {
      const domain2: Domain = {
        ...mockDomain,
        domainId: 'domain-2',
      };

      vi.mocked(
        mockTenantConfigRepository.getDomainsByTeamId,
      ).mockResolvedValue([mockDomain, domain2]);

      await useCase.execute(validInput, validContext);

      expect(mockMailRepository.sendEmail).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          domain: mockDomain,
        }),
      );
    });

    it('should log email send', async () => {
      await useCase.execute(validInput, validContext);

      expect(mockTenantConfigRepository.saveEmailLog).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'T12345',
          channelId: 'C12345',
          userId: 'U12345',
          fromAddress: 'sender@example.com',
          toAddresses: ['recipient@example.com'],
          subject: 'Test Email',
          status: 'sent',
        }),
      );
    });

    it('should generate message ID in RFC 5322 format', async () => {
      await useCase.execute(validInput, validContext);

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.messageId).toMatch(/^<\d+\.[a-z0-9]+@slackmail>$/);
    });

    it('should set current date', async () => {
      const beforeExecution = new Date();
      await useCase.execute(validInput, validContext);
      const afterExecution = new Date();

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.date.getTime()).toBeGreaterThanOrEqual(
        beforeExecution.getTime(),
      );
      expect(call.date.getTime()).toBeLessThanOrEqual(afterExecution.getTime());
    });

    it('should include CC addresses when provided', async () => {
      const inputWithCc: SendMailInput = {
        ...validInput,
        cc: [{ address: 'cc@example.com' }],
      };

      await useCase.execute(inputWithCc, validContext);

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.cc).toEqual([{ address: 'cc@example.com' }]);
    });

    it('should include BCC addresses when provided', async () => {
      const inputWithBcc: SendMailInput = {
        ...validInput,
        bcc: [{ address: 'bcc@example.com' }],
      };

      await useCase.execute(inputWithBcc, validContext);

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.bcc).toEqual([{ address: 'bcc@example.com' }]);
    });

    it('should include replyTo when provided', async () => {
      const inputWithReplyTo: SendMailInput = {
        ...validInput,
        replyTo: { address: 'replyto@example.com' },
      };

      await useCase.execute(inputWithReplyTo, validContext);

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.replyTo).toEqual({ address: 'replyto@example.com' });
    });

    it('should include threading headers when provided', async () => {
      const inputWithThreading: SendMailInput = {
        ...validInput,
        inReplyTo: '<original@example.com>',
        references: ['<ref1@example.com>', '<ref2@example.com>'],
      };

      await useCase.execute(inputWithThreading, validContext);

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.inReplyTo).toBe('<original@example.com>');
      expect(call.references).toEqual([
        '<ref1@example.com>',
        '<ref2@example.com>',
      ]);
    });

    it('should support HTML body', async () => {
      const inputWithHtml: SendMailInput = {
        ...validInput,
        body: {
          text: 'Plain text',
          html: '<p>HTML content</p>',
        },
      };

      await useCase.execute(inputWithHtml, validContext);

      const call = vi.mocked(mockMailRepository.sendEmail).mock.calls[0][0];
      expect(call.body.text).toBe('Plain text');
      expect(call.body.html).toBe('<p>HTML content</p>');
    });

    it('should propagate repository errors', async () => {
      vi.mocked(mockMailRepository.sendEmail).mockRejectedValue(
        new Error('SES rate limit exceeded'),
      );

      await expect(useCase.execute(validInput, validContext)).rejects.toThrow(
        'SES rate limit exceeded',
      );
    });
  });

  describe('validation', () => {
    it('should throw error if from address is missing', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        from: { address: '' },
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'From address is required',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if to addresses are empty', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        to: [],
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'At least one To address is required',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if to address is invalid', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        to: [{ address: '' }],
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'Invalid To address',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if CC address is invalid', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        cc: [{ address: '' }],
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'Invalid CC address',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if BCC address is invalid', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        bcc: [{ address: '' }],
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'Invalid BCC address',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if subject is empty', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        subject: '',
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'Subject is required',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if subject is only whitespace', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        subject: '   ',
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'Subject is required',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if body is empty', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        body: {},
      };

      await expect(useCase.execute(invalidInput, validContext)).rejects.toThrow(
        'Email body is required',
      );
      expect(mockMailRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should allow body with only HTML', async () => {
      const inputWithOnlyHtml: SendMailInput = {
        ...validInput,
        body: {
          html: '<p>HTML only</p>',
        },
      };

      await useCase.execute(inputWithOnlyHtml, validContext);

      expect(mockMailRepository.sendEmail).toHaveBeenCalledOnce();
    });

    it('should allow body with only text', async () => {
      const inputWithOnlyText: SendMailInput = {
        ...validInput,
        body: {
          text: 'Text only',
        },
      };

      await useCase.execute(inputWithOnlyText, validContext);

      expect(mockMailRepository.sendEmail).toHaveBeenCalledOnce();
    });
  });
});
