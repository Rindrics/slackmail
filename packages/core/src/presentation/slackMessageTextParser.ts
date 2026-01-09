/**
 * Parse Slack message text to extract bot mentions and message URLs.
 *
 * Slack formats mentions as <@USERID> and URLs as <URL> or <URL|display_text>.
 * This module handles these Slack-specific formats.
 */

export interface ParsedSlackMessageText {
  /** Whether the message contains a bot mention */
  hasBotMention: boolean;
  /** Extracted Slack message URL (if any) */
  messageUrl: string | null;
  /** Raw text with Slack formatting */
  rawText: string;
}

/**
 * Pattern to match Slack message URLs in Slack's link format.
 * Slack wraps URLs as <URL> or <URL|display_text>.
 *
 * Examples:
 * - <https://workspace.slack.com/archives/C123/p456>
 * - <https://workspace.slack.com/archives/C123/p456|View message>
 *
 * Note: Workspace names contain only alphanumeric characters and hyphens.
 * Using a specific character class prevents ReDoS vulnerabilities.
 */
const SLACK_MESSAGE_URL_PATTERN =
  /<(https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+)/i;

/**
 * Pattern to match bot mentions in Slack format.
 * Slack formats mentions as <@USERID>.
 *
 * Examples:
 * - <@U0A5R34GCJU>
 * - <@U123ABC>
 */
const BOT_MENTION_PATTERN = /<@[A-Z0-9]+>/i;

/**
 * Check if the message text contains a bot mention.
 *
 * @param text - Slack message text
 * @returns True if the message contains a bot mention
 */
export function hasBotMention(text: string): boolean {
  return BOT_MENTION_PATTERN.test(text);
}

/**
 * Extract a Slack message URL from the message text.
 *
 * @param text - Slack message text
 * @returns The extracted URL or null if not found
 */
export function extractSlackMessageUrl(text: string): string | null {
  const match = text.match(SLACK_MESSAGE_URL_PATTERN);
  return match ? match[1] : null;
}

/**
 * Parse Slack message text to extract relevant information.
 *
 * @param text - Slack message text
 * @returns Parsed message information
 */
export function parseSlackMessageText(text: string): ParsedSlackMessageText {
  return {
    hasBotMention: hasBotMention(text),
    messageUrl: extractSlackMessageUrl(text),
    rawText: text,
  };
}

/**
 * Check if the message text is a valid email send request.
 * A valid request contains both a bot mention and a Slack message URL.
 *
 * @param text - Slack message text
 * @returns True if this is a valid email send request
 */
export function isEmailSendRequest(text: string): boolean {
  const parsed = parseSlackMessageText(text);
  return parsed.hasBotMention && parsed.messageUrl !== null;
}

/**
 * Check if the message text is a template request.
 * Pattern: @bot template (in any order, case insensitive)
 *
 * @param text - Slack message text
 * @returns True if this is a template request
 */
export function isTemplateRequest(text: string): boolean {
  return hasBotMention(text) && /\btemplate\b/i.test(text);
}
