import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SendMailUseCase,
  type SendMailInput,
} from '@/application/usecases/sendMailUseCase';
import type { MailRepository } from '@/domain/repositories/mailRepository';

describe('SendMailUseCase', () => {
  let useCase: SendMailUseCase;
  let mockRepository: MailRepository;

  const validInput: SendMailInput = {
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'recipient@example.com', name: 'Recipient' }],
    subject: 'Test Email',
    body: {
      text: 'This is a test email.',
    },
  };

  beforeEach(() => {
    mockRepository = {
      sendEmail: vi.fn().mockResolvedValue('test-message-id-12345'),
    };
    useCase = new SendMailUseCase(mockRepository);
  });

  describe('execute', () => {
    it('should send email successfully', async () => {
      const result = await useCase.execute(validInput);

      expect(result.messageId).toBe('test-message-id-12345');
      expect(mockRepository.sendEmail).toHaveBeenCalledOnce();
      expect(mockRepository.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: validInput.from,
          to: validInput.to,
          subject: validInput.subject,
          body: validInput.body,
        }),
      );
    });

    it('should generate message ID in RFC 5322 format', async () => {
      await useCase.execute(validInput);

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
      expect(call.messageId).toMatch(/^<\d+\.[a-z0-9]+@slackmail>$/);
    });

    it('should set current date', async () => {
      const beforeExecution = new Date();
      await useCase.execute(validInput);
      const afterExecution = new Date();

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
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

      await useCase.execute(inputWithCc);

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
      expect(call.cc).toEqual([{ address: 'cc@example.com' }]);
    });

    it('should include BCC addresses when provided', async () => {
      const inputWithBcc: SendMailInput = {
        ...validInput,
        bcc: [{ address: 'bcc@example.com' }],
      };

      await useCase.execute(inputWithBcc);

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
      expect(call.bcc).toEqual([{ address: 'bcc@example.com' }]);
    });

    it('should include replyTo when provided', async () => {
      const inputWithReplyTo: SendMailInput = {
        ...validInput,
        replyTo: { address: 'replyto@example.com' },
      };

      await useCase.execute(inputWithReplyTo);

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
      expect(call.replyTo).toEqual({ address: 'replyto@example.com' });
    });

    it('should include threading headers when provided', async () => {
      const inputWithThreading: SendMailInput = {
        ...validInput,
        inReplyTo: '<original@example.com>',
        references: ['<ref1@example.com>', '<ref2@example.com>'],
      };

      await useCase.execute(inputWithThreading);

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
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

      await useCase.execute(inputWithHtml);

      const call = vi.mocked(mockRepository.sendEmail).mock.calls[0][0];
      expect(call.body.text).toBe('Plain text');
      expect(call.body.html).toBe('<p>HTML content</p>');
    });

    it('should propagate repository errors', async () => {
      vi.mocked(mockRepository.sendEmail).mockRejectedValue(
        new Error('SES rate limit exceeded'),
      );

      await expect(useCase.execute(validInput)).rejects.toThrow(
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

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'From address is required',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if to addresses are empty', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        to: [],
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'At least one To address is required',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if to address is invalid', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        to: [{ address: '' }],
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Invalid To address',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if CC address is invalid', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        cc: [{ address: '' }],
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Invalid CC address',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if BCC address is invalid', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        bcc: [{ address: '' }],
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Invalid BCC address',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if subject is empty', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        subject: '',
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Subject is required',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if subject is only whitespace', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        subject: '   ',
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Subject is required',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should throw error if body is empty', async () => {
      const invalidInput: SendMailInput = {
        ...validInput,
        body: {},
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Email body is required',
      );
      expect(mockRepository.sendEmail).not.toHaveBeenCalled();
    });

    it('should allow body with only HTML', async () => {
      const inputWithOnlyHtml: SendMailInput = {
        ...validInput,
        body: {
          html: '<p>HTML only</p>',
        },
      };

      await useCase.execute(inputWithOnlyHtml);

      expect(mockRepository.sendEmail).toHaveBeenCalledOnce();
    });

    it('should allow body with only text', async () => {
      const inputWithOnlyText: SendMailInput = {
        ...validInput,
        body: {
          text: 'Text only',
        },
      };

      await useCase.execute(inputWithOnlyText);

      expect(mockRepository.sendEmail).toHaveBeenCalledOnce();
    });
  });
});
