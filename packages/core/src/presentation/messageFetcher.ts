import type { WebClient } from '@slack/web-api';

/**
 * Fetch a message from Slack by channel ID and timestamp.
 */

export class MessageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageFetchError';
  }
}

/**
 * Fetch a specific message from Slack.
 *
 * @param client - Slack Web API client
 * @param channelId - Channel ID
 * @param timestamp - Message timestamp (e.g., "1234567890.123456")
 * @returns Message text
 * @throws {MessageFetchError} If message cannot be fetched
 */
export async function fetchMessage(
  client: WebClient,
  channelId: string,
  timestamp: string,
): Promise<string> {
  try {
    // Fetch message using conversations.history
    // We use inclusive timestamps and limit to find the exact message
    const result = await client.conversations.history({
      channel: channelId,
      latest: timestamp,
      oldest: timestamp,
      inclusive: true,
      limit: 1,
    });

    if (!result.ok) {
      throw new MessageFetchError(
        `Slack API error: ${result.error ?? 'unknown error'}`,
      );
    }

    if (!result.messages || result.messages.length === 0) {
      throw new MessageFetchError(
        `Message not found: ${channelId}/${timestamp}`,
      );
    }

    const message = result.messages[0];

    if (!message.text) {
      throw new MessageFetchError(
        `Message has no text content: ${channelId}/${timestamp}`,
      );
    }

    return message.text;
  } catch (error) {
    if (error instanceof MessageFetchError) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new MessageFetchError(`Failed to fetch message: ${errorMessage}`);
  }
}
