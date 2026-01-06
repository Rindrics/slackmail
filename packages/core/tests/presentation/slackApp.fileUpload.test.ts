import type { App } from '@slack/bolt';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Email } from '@/domain/entities';
import { postEmailToSlack } from '@/presentation/slackApp';

/**
 * Test suite for handling long emails with file upload fallback
 *
 * ADR: 006-slack-block-kit-character-limits.md
 * Issue: Invalid blocks error when email body exceeds Slack's 3000 char limit
 *
 * Strategy:
 * - Short emails (<2800 chars): Display in blocks normally
 * - Long emails (>2800 chars): Upload body as file, show preview in blocks
 */

describe('Slack File Upload for Long Emails', () => {
  let mockApp: App;
  let testEmail: Email;

  beforeEach(() => {
    // Create mock Slack app with both chat and files APIs
    mockApp = {
      client: {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '12345.67' }),
        },
        files: {
          uploadV2: vi.fn().mockResolvedValue({ ok: true }),
        },
      },
    } as unknown as App;

    // Create test email (short body by default)
    testEmail = {
      messageId: 'test-123@example.com',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'recipient@example.com', name: 'Recipient' }],
      subject: 'Test Subject',
      body: {
        text: 'Short email body.',
      },
      date: new Date('2025-01-01T00:00:00Z'),
    };
  });

  describe('Short emails (within character limits)', () => {
    test('should post message normally without file upload', async () => {
      await postEmailToSlack(mockApp, 'C12345', testEmail);

      // Should call postMessage
      expect(mockApp.client.chat.postMessage).toHaveBeenCalledOnce();

      // Should NOT call files.uploadV2
      expect(mockApp.client.files.uploadV2).not.toHaveBeenCalled();
    });
  });

  describe('Long emails (exceeding character limits)', () => {
    test('should upload body as file when exceeding 2800 characters', async () => {
      const longBody = 'Lorem ipsum dolor sit amet. '.repeat(150); // ~4200 characters
      const emailWithLongBody: Email = {
        ...testEmail,
        body: { text: longBody },
      };

      await postEmailToSlack(mockApp, 'C12345', emailWithLongBody);

      // Should call files.uploadV2
      expect(mockApp.client.files.uploadV2).toHaveBeenCalledOnce();
      expect(mockApp.client.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'C12345',
          content: longBody.trim(), // Body text is trimmed
          filename: expect.stringContaining('email-body-'),
          snippet_type: 'text',
        }),
      );

      // Should still call postMessage for metadata blocks
      expect(mockApp.client.chat.postMessage).toHaveBeenCalledOnce();
    });

    test('should include initial_comment with email metadata in file upload', async () => {
      const longBody = 'Lorem ipsum dolor sit amet. '.repeat(150);
      const emailWithLongBody: Email = {
        ...testEmail,
        body: { text: longBody },
      };

      await postEmailToSlack(mockApp, 'C12345', emailWithLongBody);

      expect(mockApp.client.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          initial_comment: expect.stringContaining('Test Subject'),
        }),
      );
    });

    test('should use messageId in filename for file upload', async () => {
      const longBody = 'Lorem ipsum dolor sit amet. '.repeat(150);
      const emailWithLongBody: Email = {
        ...testEmail,
        messageId: 'unique-id-456@example.com',
        body: { text: longBody },
      };

      await postEmailToSlack(mockApp, 'C12345', emailWithLongBody);

      expect(mockApp.client.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'email-body-unique-id-456@example.com.txt',
        }),
      );
    });

    test('should include preview in blocks when body is uploaded as file', async () => {
      const longBody = 'Lorem ipsum dolor sit amet. '.repeat(150);
      const emailWithLongBody: Email = {
        ...testEmail,
        body: { text: longBody },
      };

      await postEmailToSlack(mockApp, 'C12345', emailWithLongBody);

      // Get the postMessage call arguments
      const postMessageCalls = (
        mockApp.client.chat.postMessage as ReturnType<typeof vi.fn>
      ).mock.calls;
      const postMessageCall = postMessageCalls[0][0];

      // Check that blocks include preview message
      const blocks = postMessageCall.blocks || [];
      const hasPreviewMessage = blocks.some((block) => {
        const text = (block as { text?: { text: string } }).text?.text;
        return text?.includes('Full email body attached as file.');
      });

      expect(hasPreviewMessage).toBe(true);
    });
  });

  describe('Error handling for file uploads', () => {
    test('should handle file upload errors gracefully', async () => {
      const longBody = 'Lorem ipsum dolor sit amet. '.repeat(150);
      const emailWithLongBody: Email = {
        ...testEmail,
        body: { text: longBody },
      };

      // Mock file upload failure
      (mockApp.client.files.uploadV2 as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('File upload failed'),
      );

      // Should throw error
      await expect(
        postEmailToSlack(mockApp, 'C12345', emailWithLongBody),
      ).rejects.toThrow();
    });
  });
});
