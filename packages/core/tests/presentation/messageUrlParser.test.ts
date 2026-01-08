import { describe, expect, it } from 'vitest';
import {
  MessageUrlParseError,
  parseMessageUrl,
} from '@/presentation/messageUrlParser';

describe('parseMessageUrl', () => {
  it('should parse valid Slack message URL', () => {
    const url =
      'https://myworkspace.slack.com/archives/C01234ABCD/p1234567890123456';
    const result = parseMessageUrl(url);

    expect(result.channelId).toBe('C01234ABCD');
    expect(result.timestamp).toBe('1234567890.123456');
  });

  it('should handle URL with different workspace name', () => {
    const url =
      'https://another-workspace.slack.com/archives/C98765WXYZ/p9876543210654321';
    const result = parseMessageUrl(url);

    expect(result.channelId).toBe('C98765WXYZ');
    expect(result.timestamp).toBe('9876543210.654321');
  });

  it('should handle URL with shorter microsecond part', () => {
    const url = 'https://workspace.slack.com/archives/C01234ABCD/p1234567890';
    const result = parseMessageUrl(url);

    expect(result.channelId).toBe('C01234ABCD');
    expect(result.timestamp).toBe('1234567890.');
  });

  it('should throw error for invalid URL format', () => {
    const invalidUrl = 'https://example.com/not-a-slack-url';

    expect(() => parseMessageUrl(invalidUrl)).toThrow(MessageUrlParseError);
    expect(() => parseMessageUrl(invalidUrl)).toThrow(
      'Invalid Slack message URL format',
    );
  });

  it('should throw error for URL without /archives/', () => {
    const invalidUrl =
      'https://myworkspace.slack.com/messages/C01234ABCD/p1234567890';

    expect(() => parseMessageUrl(invalidUrl)).toThrow(MessageUrlParseError);
  });

  it('should throw error for URL without p prefix in timestamp', () => {
    const invalidUrl =
      'https://myworkspace.slack.com/archives/C01234ABCD/1234567890';

    expect(() => parseMessageUrl(invalidUrl)).toThrow(MessageUrlParseError);
  });

  it('should throw error for too-short timestamp', () => {
    const invalidUrl = 'https://myworkspace.slack.com/archives/C01234ABCD/p123';

    expect(() => parseMessageUrl(invalidUrl)).toThrow(MessageUrlParseError);
    expect(() => parseMessageUrl(invalidUrl)).toThrow(
      'Invalid timestamp format',
    );
  });

  it('should throw error for non-Slack domain', () => {
    const invalidUrl = 'https://example.com/archives/C01234ABCD/p1234567890';

    expect(() => parseMessageUrl(invalidUrl)).toThrow(MessageUrlParseError);
  });
});
