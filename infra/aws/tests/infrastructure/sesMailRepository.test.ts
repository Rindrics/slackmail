import { Readable } from 'node:stream';
import type { SESv2Client } from '@aws-sdk/client-sesv2';
import type { Email, SendContext } from '@rindrics/slackmail';
import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESMailRepository } from '@/infrastructure/sesMailRepository';

// Mock nodemailer
vi.mock('nodemailer');

// Mock AWS SDK
vi.mock('@aws-sdk/client-sesv2');

describe('SESMailRepository', () => {
  let repository: SESMailRepository;
  let mockSendMail: ReturnType<typeof vi.fn>;
  let mockSesSend: ReturnType<typeof vi.fn>;
  let mockSesClient: SESv2Client;

  const testEmail: Email = {
    messageId: 'test-message-id@example.com',
    from: { name: 'Sender', address: 'sender@verified-domain.com' },
    to: [{ name: 'Recipient', address: 'recipient@example.com' }],
    subject: 'Test Email',
    body: {
      text: 'This is a test email.',
      html: '<p>This is a test email.</p>',
    },
    date: new Date('2025-01-07T00:00:00Z'),
  };

  const mockSendContext: SendContext = {
    tenantConfig: {
      teamId: 'T12345',
      teamName: 'Test Workspace',
      botUserId: 'U12345',
      botTokenSecretArn:
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
      plan: 'pro',
      status: 'active',
      installedAt: new Date(),
      installedBy: 'U00001',
    },
    domain: {
      domainId: 'domain-1',
      teamId: 'T12345',
      domain: 'verified-domain.com',
      verificationStatus: 'verified',
      dkimStatus: 'verified',
      mailFromStatus: 'verified',
      defaultSender: 'noreply@verified-domain.com',
      createdAt: new Date(),
    },
    slackTeamId: 'T12345',
    slackChannelId: 'C12345',
    slackUserId: 'U12345',
  };

  beforeEach(() => {
    // Create a readable stream that emits raw MIME data
    const createMockStream = () => {
      const stream = new Readable();
      stream.push('MIME-Version: 1.0\r\n');
      stream.push('From: test@example.com\r\n');
      stream.push('\r\n');
      stream.push('Test body');
      stream.push(null);
      return stream;
    };

    mockSendMail = vi.fn().mockResolvedValue({
      messageId: 'test-message-id@example.com',
      message: createMockStream(),
    });

    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    // Mock SES client
    mockSesSend = vi.fn().mockResolvedValue({
      MessageId: 'ses-message-id-12345',
    });

    mockSesClient = {
      send: mockSesSend,
    } as unknown as SESv2Client;

    repository = new SESMailRepository({
      sesClient: mockSesClient,
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully and return message ID', async () => {
      const messageId = await repository.sendEmail(testEmail, mockSendContext);

      expect(messageId).toBe('ses-message-id-12345');

      // Verify nodemailer was called to build MIME
      expect(mockSendMail).toHaveBeenCalledOnce();
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Sender <sender@verified-domain.com>',
          to: ['Recipient <recipient@example.com>'],
          subject: 'Test Email',
          text: 'This is a test email.',
          html: '<p>This is a test email.</p>',
        }),
      );

      // Verify SES SDK was called
      expect(mockSesSend).toHaveBeenCalledOnce();
    });

    it('should include cc and bcc if provided', async () => {
      const emailWithCcBcc: Email = {
        ...testEmail,
        cc: [{ address: 'cc@example.com' }],
        bcc: [{ address: 'bcc@example.com' }],
      };

      await repository.sendEmail(emailWithCcBcc, mockSendContext);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
        }),
      );
    });

    it('should include replyTo if provided', async () => {
      const emailWithReplyTo: Email = {
        ...testEmail,
        replyTo: { address: 'replyto@verified-domain.com' },
      };

      await repository.sendEmail(emailWithReplyTo, mockSendContext);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'replyto@verified-domain.com',
        }),
      );
    });

    it('should include inReplyTo and references for threaded emails', async () => {
      const threadedEmail: Email = {
        ...testEmail,
        inReplyTo: '<original-message-id@example.com>',
        references: ['<ref1@example.com>', '<ref2@example.com>'],
      };

      await repository.sendEmail(threadedEmail, mockSendContext);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<original-message-id@example.com>',
          references: ['<ref1@example.com>', '<ref2@example.com>'],
        }),
      );
    });

    it('should format email addresses with names correctly', async () => {
      const emailWithNames: Email = {
        ...testEmail,
        from: { name: 'John Doe', address: 'john@verified-domain.com' },
        to: [{ name: 'Jane Smith', address: 'jane@example.com' }],
      };

      await repository.sendEmail(emailWithNames, mockSendContext);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'John Doe <john@verified-domain.com>',
          to: ['Jane Smith <jane@example.com>'],
        }),
      );
    });

    it('should format email addresses without names correctly', async () => {
      const emailWithoutNames: Email = {
        ...testEmail,
        from: { address: 'noreply@verified-domain.com' },
        to: [{ address: 'user@example.com' }],
      };

      await repository.sendEmail(emailWithoutNames, mockSendContext);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@verified-domain.com',
          to: ['user@example.com'],
        }),
      );
    });
  });

  describe('sender domain validation', () => {
    it('should reject email from unauthorized domain', async () => {
      const invalidEmail: Email = {
        ...testEmail,
        from: { address: 'sender@unauthorized.com' },
      };

      await expect(
        repository.sendEmail(invalidEmail, mockSendContext),
      ).rejects.toThrow(
        'Invalid sender domain: unauthorized.com. Must be @verified-domain.com',
      );

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should accept email from allowed domain', async () => {
      const validEmail: Email = {
        ...testEmail,
        from: { address: 'anyuser@verified-domain.com' },
      };

      await repository.sendEmail(validEmail, mockSendContext);

      expect(mockSendMail).toHaveBeenCalledOnce();
    });

    it('should validate sender domain case-sensitively', async () => {
      const mixedCaseEmail: Email = {
        ...testEmail,
        from: { address: 'sender@Verified-Domain.COM' },
      };

      await expect(
        repository.sendEmail(mixedCaseEmail, mockSendContext),
      ).rejects.toThrow('Invalid sender domain');
    });

    it('should reject email from unverified domain', async () => {
      const unverifiedContext: SendContext = {
        ...mockSendContext,
        domain: {
          ...mockSendContext.domain,
          verificationStatus: 'pending',
        },
      };

      await expect(
        repository.sendEmail(testEmail, unverifiedContext),
      ).rejects.toThrow('is not verified');
    });
  });

  describe('error handling', () => {
    it('should wrap SES errors with descriptive message', async () => {
      mockSesSend.mockRejectedValue(new Error('SES rate limit exceeded'));

      await expect(
        repository.sendEmail(testEmail, mockSendContext),
      ).rejects.toThrow(
        'Failed to send email via SES: SES rate limit exceeded',
      );
    });

    it('should handle nodemailer errors', async () => {
      mockSendMail.mockRejectedValue(new Error('Failed to build MIME'));

      await expect(
        repository.sendEmail(testEmail, mockSendContext),
      ).rejects.toThrow('Failed to send email via SES: Failed to build MIME');
    });

    it('should handle unknown errors', async () => {
      mockSesSend.mockRejectedValue('Unknown error');

      await expect(
        repository.sendEmail(testEmail, mockSendContext),
      ).rejects.toThrow('Failed to send email via SES: Unknown error');
    });
  });
});
