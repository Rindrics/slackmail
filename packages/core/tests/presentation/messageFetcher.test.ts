import type { WebClient } from '@slack/web-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMessage, MessageFetchError } from '@/presentation/messageFetcher';

describe('fetchMessage', () => {
  let mockClient: WebClient;

  beforeEach(() => {
    mockClient = {
      conversations: {
        history: vi.fn(),
      },
    } as unknown as WebClient;
  });

  it('should fetch message successfully', async () => {
    const mockHistory = vi.mocked(mockClient.conversations.history);
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [
        {
          text: 'Test message content',
          ts: '1234567890.123456',
        },
      ],
    });

    const result = await fetchMessage(
      mockClient,
      'C01234ABCD',
      '1234567890.123456',
    );

    expect(result).toBe('Test message content');
    expect(mockHistory).toHaveBeenCalledWith({
      channel: 'C01234ABCD',
      latest: '1234567890.123456',
      oldest: '1234567890.123456',
      inclusive: true,
      limit: 1,
    });
  });

  it('should throw error if Slack API returns not ok', async () => {
    const mockHistory = vi.mocked(mockClient.conversations.history);
    mockHistory.mockResolvedValue({
      ok: false,
      error: 'channel_not_found',
    });

    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow(MessageFetchError);
    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow('Slack API error: channel_not_found');
  });

  it('should throw error if message not found', async () => {
    const mockHistory = vi.mocked(mockClient.conversations.history);
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [],
    });

    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow(MessageFetchError);
    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow('Message not found');
  });

  it('should throw error if message has no text', async () => {
    const mockHistory = vi.mocked(mockClient.conversations.history);
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [
        {
          ts: '1234567890.123456',
          // No text field
        },
      ],
    });

    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow(MessageFetchError);
    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow('Message has no text content');
  });

  it('should wrap API errors', async () => {
    const mockHistory = vi.mocked(mockClient.conversations.history);
    mockHistory.mockRejectedValue(new Error('Network error'));

    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow(MessageFetchError);
    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow('Failed to fetch message: Network error');
  });

  it('should handle unknown errors', async () => {
    const mockHistory = vi.mocked(mockClient.conversations.history);
    mockHistory.mockRejectedValue('Unknown error type');

    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow(MessageFetchError);
    await expect(
      fetchMessage(mockClient, 'C01234ABCD', '1234567890.123456'),
    ).rejects.toThrow('Failed to fetch message: Unknown error');
  });
});
