import type { App } from '@slack/bolt';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Email } from '@/domain/entities';
import { postEmailToSlack, SlackPostError } from '@/presentation/slackApp';

/**
 * Test suite for handling Slack platform errors (slack_webapi_platform_error)
 *
 * Issue: #44 - Cannot receive forwarded email
 * Root cause: slack_webapi_platform_error is a wrapper error; actual error is in error.data
 *
 * Decisions (from /issync:align-spec):
 * - Q1: No retry logic initially (simpler, fail fast)
 * - Q2: Fall back to 'unknown_platform_error' if error.data.error is undefined
 * - Q3: Capture all platform errors to Sentry (no filtering changes needed)
 */

describe('Slack Platform Error Handling', () => {
  let mockApp: App;
  let testEmail: Email;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create mock Slack app
    mockApp = {
      client: {
        chat: {
          postMessage: vi.fn(),
        },
      },
    } as unknown as App;

    // Create test email
    testEmail = {
      messageId: 'test-123@example.com',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'recipient@example.com', name: 'Recipient' }],
      subject: 'Test Subject',
      body: {
        text: 'Test body',
        html: '<p>Test body</p>',
      },
      date: new Date('2025-01-01T00:00:00Z'),
    };

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Error extraction from slack_webapi_platform_error', () => {
    test('should extract actual error code from error.data.error when slack_webapi_platform_error occurs', async () => {
      // Mock Slack API to throw platform error with nested error
      const platformError = new Error(
        'An API error occurred: fatal_error',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'fatal_error',
        message: 'Slack is temporarily unavailable',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      // Should throw SlackPostError with actual error code
      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toMatchObject({
        code: 'fatal_error',
      });
    });

    test('should extract actual error message from error.data.message when slack_webapi_platform_error occurs', async () => {
      // Mock Slack API to throw platform error with nested message
      const platformError = new Error(
        'An API error occurred: not_authed',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'not_authed',
        message: 'No authentication token provided.',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(/Original message: No authentication token provided\./);
    });

    test('should fall back to "unknown_platform_error" when error.data.error is undefined', async () => {
      // Mock Slack API to throw platform error without error.data
      const platformError = new Error('An API error occurred') as Error & {
        code: string;
      };
      platformError.code = 'slack_webapi_platform_error';

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toMatchObject({
        code: 'unknown_platform_error',
      });
    });

    test('should log full error object including error.data for debugging when error.data.error is unknown', async () => {
      // Mock Slack API to throw platform error
      const platformError = new Error(
        'An API error occurred: users_not_found',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'users_not_found',
        message: 'Users not found',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      // Ensure error is thrown
      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      // Should log both the message and the full error object
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slack platform error: users_not_found'),
        platformError,
      );
    });
  });

  describe('Specific platform error handling', () => {
    test('should handle fatal_error from Slack platform with message "Slack platform error: fatal_error"', async () => {
      const platformError = new Error(
        'An API error occurred: fatal_error',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'fatal_error',
        message: 'Fatal error occurred',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      // Ensure error is thrown
      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Slack platform error: fatal_error - Fatal error occurred',
        platformError,
      );
    });

    test('should handle not_authed error from Slack platform and include authentication guidance in message', async () => {
      const platformError = new Error(
        'An API error occurred: not_authed',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'not_authed',
        message: 'No authentication token provided.',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(/actual: not_authed/);
    });

    test('should handle account_inactive error from Slack platform with clear actionable message', async () => {
      const platformError = new Error(
        'An API error occurred: account_inactive',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'account_inactive',
        message: 'Account is inactive',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toMatchObject({
        code: 'account_inactive',
        message: expect.stringContaining('account_inactive'),
      });
    });
  });

  describe('Error message formatting', () => {
    test('should throw SlackPostError with format "Slack API error: slack_webapi_platform_error (actual: fatal_error)"', async () => {
      const platformError = new Error(
        'An API error occurred: fatal_error',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'fatal_error',
        message: 'Fatal error',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(
        'Slack API error: slack_webapi_platform_error (actual: fatal_error)',
      );
    });

    test('should preserve original error.data in thrown SlackPostError for Sentry reporting', async () => {
      const platformError = new Error(
        'An API error occurred: fatal_error',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'fatal_error',
        message: 'Fatal error occurred',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      // The error should be SlackPostError with the actual error code
      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toMatchObject({
        code: 'fatal_error',
        message: expect.stringContaining('Fatal error occurred'),
      });
    });

    test('should log both wrapper error code and actual error code to console.error', async () => {
      const platformError = new Error(
        'An API error occurred: not_authed',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'not_authed',
        message: 'No authentication',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      // Ensure error is thrown
      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      // Should log the actual error code
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Slack platform error: not_authed - No authentication',
        platformError,
      );
    });
  });

  describe('Forwarded email scenario (no retry)', () => {
    test('should successfully process forwarded email when Slack API is healthy', async () => {
      // Mock successful API response
      vi.mocked(mockApp.client.chat.postMessage).mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
        channel: 'C12345',
        message: {},
      });

      const result = await postEmailToSlack(mockApp, 'C12345', testEmail);

      expect(result).toBe('1234567890.123456');
      expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C12345',
        }),
      );
    });

    test('should fail immediately without retry when platform error occurs (fail fast)', async () => {
      const platformError = new Error(
        'An API error occurred: fatal_error',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      platformError.code = 'slack_webapi_platform_error';
      platformError.data = {
        error: 'fatal_error',
        message: 'Fatal error',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(
        platformError,
      );

      // Should throw immediately without retrying
      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toThrow(SlackPostError);

      // Should only call once (no retry)
      expect(mockApp.client.chat.postMessage).toHaveBeenCalledTimes(1);
    });

    test('should provide actionable error message indicating whether issue is auth, Slack outage, or unknown', async () => {
      // Test not_authed (auth issue)
      const authError = new Error(
        'An API error occurred: not_authed',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      authError.code = 'slack_webapi_platform_error';
      authError.data = {
        error: 'not_authed',
        message: 'No authentication token provided.',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(authError);

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toMatchObject({
        code: 'not_authed',
        message: expect.stringContaining('not_authed'),
      });

      // Test fatal_error (Slack outage)
      const outageError = new Error(
        'An API error occurred: fatal_error',
      ) as Error & {
        code: string;
        data: { error: string; message: string };
      };
      outageError.code = 'slack_webapi_platform_error';
      outageError.data = {
        error: 'fatal_error',
        message: 'Slack is temporarily unavailable',
      };

      vi.mocked(mockApp.client.chat.postMessage).mockRejectedValue(outageError);

      await expect(
        postEmailToSlack(mockApp, 'C12345', testEmail),
      ).rejects.toMatchObject({
        code: 'fatal_error',
        message: expect.stringContaining('fatal_error'),
      });
    });
  });
});
