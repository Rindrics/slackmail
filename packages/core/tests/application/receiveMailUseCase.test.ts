import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiveMailUseCase } from '@/application';
import type { Email } from '@/domain/entities';
import type { StorageRepository } from '@/domain/repositories';
import { MailparserEmailParser } from '@/infrastructure';

describe('ReceiveMailUseCase', () => {
  const rawEmail =
    'Message-ID: <test-123@example.com>\r\n' +
    'From: Sender <sender@example.com>\r\n' +
    'To: recipient@example.com\r\n' +
    'Subject: Test Subject\r\n' +
    'Date: Wed, 01 Jan 2025 00:00:00 +0000\r\n' +
    '\r\n' +
    'Test body';

  let mockStorageRepository: StorageRepository;
  let emailParser: MailparserEmailParser;
  let mockOnEmailReceived: ReturnType<
    typeof vi.fn<(email: Email) => Promise<void>>
  >;

  beforeEach(() => {
    mockStorageRepository = {
      fetchRawEmail: vi.fn().mockResolvedValue(rawEmail),
    };

    emailParser = new MailparserEmailParser();

    mockOnEmailReceived = vi
      .fn<(email: Email) => Promise<void>>()
      .mockResolvedValue(undefined);
  });

  it('should fetch, parse, and notify email reception', async () => {
    const useCase = new ReceiveMailUseCase({
      storageRepository: mockStorageRepository,
      emailParser,
      onEmailReceived: mockOnEmailReceived,
    });

    const result = await useCase.execute({ storageKey: 'emails/test.eml' });

    expect(mockStorageRepository.fetchRawEmail).toHaveBeenCalledWith(
      'emails/test.eml',
    );
    expect(mockOnEmailReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'test-123@example.com',
        from: { address: 'sender@example.com', name: 'Sender' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body' },
      }),
    );
    expect(result.email.messageId).toBe('test-123@example.com');
    expect(result.email.subject).toBe('Test Subject');
  });

  it('should propagate storage repository errors', async () => {
    const error = new Error('Storage error');
    mockStorageRepository.fetchRawEmail = vi.fn().mockRejectedValue(error);

    const useCase = new ReceiveMailUseCase({
      storageRepository: mockStorageRepository,
      emailParser,
      onEmailReceived: mockOnEmailReceived,
    });

    await expect(
      useCase.execute({ storageKey: 'emails/test.eml' }),
    ).rejects.toThrow('Storage error');
    expect(mockOnEmailReceived).not.toHaveBeenCalled();
  });

  it('should propagate callback errors', async () => {
    const error = new Error('Callback error');
    mockOnEmailReceived.mockRejectedValue(error);

    const useCase = new ReceiveMailUseCase({
      storageRepository: mockStorageRepository,
      emailParser,
      onEmailReceived: mockOnEmailReceived,
    });

    await expect(
      useCase.execute({ storageKey: 'emails/test.eml' }),
    ).rejects.toThrow('Callback error');
  });

  it('should throw error for empty storageKey', async () => {
    const useCase = new ReceiveMailUseCase({
      storageRepository: mockStorageRepository,
      emailParser,
      onEmailReceived: mockOnEmailReceived,
    });

    await expect(useCase.execute({ storageKey: '' })).rejects.toThrow(
      'storageKey cannot be empty',
    );
    await expect(useCase.execute({ storageKey: '   ' })).rejects.toThrow(
      'storageKey cannot be empty',
    );
    expect(mockStorageRepository.fetchRawEmail).not.toHaveBeenCalled();
  });
});
