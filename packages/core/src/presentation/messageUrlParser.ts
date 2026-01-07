/**
 * Parse a Slack message URL to extract channel ID and timestamp.
 *
 * Slack message URLs have the format:
 * https://<workspace>.slack.com/archives/<channel>/p<timestamp>
 *
 * Example:
 * https://myworkspace.slack.com/archives/C01234ABCD/p1234567890123456
 * -> { channelId: 'C01234ABCD', timestamp: '1234567890.123456' }
 */

export interface ParsedMessageUrl {
  channelId: string;
  timestamp: string;
}

export class MessageUrlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageUrlParseError';
  }
}

/**
 * Parse a Slack message URL.
 *
 * @param url - The Slack message URL
 * @returns Parsed channel ID and timestamp
 * @throws {MessageUrlParseError} If URL format is invalid
 */
export function parseMessageUrl(url: string): ParsedMessageUrl {
  // Match pattern: https://<workspace>.slack.com/archives/<channel>/p<timestamp>
  const pattern =
    /^https:\/\/[^/]+\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)$/;
  const match = url.match(pattern);

  if (!match) {
    throw new MessageUrlParseError(
      `Invalid Slack message URL format: ${url}`,
    );
  }

  const channelId = match[1];
  const timestampStr = match[2];

  // Convert timestamp from permalink format to Slack API format
  // Permalink: p1234567890123456 (no decimal, p prefix)
  // API format: 1234567890.123456 (with decimal)
  if (timestampStr.length < 10) {
    throw new MessageUrlParseError(
      `Invalid timestamp format in URL: ${timestampStr}`,
    );
  }

  // Insert decimal point after the first 10 digits (Unix timestamp seconds)
  const timestamp = `${timestampStr.substring(0, 10)}.${timestampStr.substring(10)}`;

  return { channelId, timestamp };
}
