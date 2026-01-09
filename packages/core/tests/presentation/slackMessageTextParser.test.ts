import { describe, expect, it } from 'vitest';
import {
  extractSlackMessageUrl,
  hasBotMention,
  isEmailSendRequest,
  isTemplateRequest,
  parseSlackMessageText,
} from '../../src/presentation/slackMessageTextParser';

describe('slackMessageTextParser', () => {
  describe('hasBotMention', () => {
    it('should return true for message with bot mention', () => {
      expect(hasBotMention('<@U0A5R34GCJU> hello')).toBe(true);
    });

    it('should return true for message with bot mention at end', () => {
      expect(hasBotMention('hello <@U0A5R34GCJU>')).toBe(true);
    });

    it('should return true for message with bot mention in middle', () => {
      expect(hasBotMention('hello <@U0A5R34GCJU> world')).toBe(true);
    });

    it('should return false for message without bot mention', () => {
      expect(hasBotMention('hello world')).toBe(false);
    });

    it('should return false for message with invalid mention format', () => {
      expect(hasBotMention('@U0A5R34GCJU hello')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasBotMention('')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(hasBotMention('<@u0a5r34gcju> hello')).toBe(true);
    });
  });

  describe('extractSlackMessageUrl', () => {
    it('should extract URL from Slack link format', () => {
      const text =
        '<@U0A5R34GCJU> <https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709>';
      expect(extractSlackMessageUrl(text)).toBe(
        'https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709',
      );
    });

    it('should extract URL from Slack link with display text', () => {
      const text =
        '<@U0A5R34GCJU> <https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709|View message>';
      expect(extractSlackMessageUrl(text)).toBe(
        'https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709',
      );
    });

    it('should extract URL when mention comes after URL', () => {
      const text =
        '<https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709> <@U0A5R34GCJU>';
      expect(extractSlackMessageUrl(text)).toBe(
        'https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709',
      );
    });

    it('should return null for message without URL', () => {
      expect(extractSlackMessageUrl('<@U0A5R34GCJU> hello')).toBeNull();
    });

    it('should return null for non-Slack URL', () => {
      expect(
        extractSlackMessageUrl('<@U0A5R34GCJU> <https://example.com>'),
      ).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractSlackMessageUrl('')).toBeNull();
    });

    it('should handle different workspace names', () => {
      const text = '<https://mycompany.slack.com/archives/C123ABC/p9876543210>';
      expect(extractSlackMessageUrl(text)).toBe(
        'https://mycompany.slack.com/archives/C123ABC/p9876543210',
      );
    });
  });

  describe('parseSlackMessageText', () => {
    it('should parse message with bot mention and URL', () => {
      const text =
        '<@U0A5R34GCJU> <https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709>';
      const result = parseSlackMessageText(text);

      expect(result.hasBotMention).toBe(true);
      expect(result.messageUrl).toBe(
        'https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709',
      );
      expect(result.rawText).toBe(text);
    });

    it('should parse message with only bot mention', () => {
      const text = '<@U0A5R34GCJU> hello';
      const result = parseSlackMessageText(text);

      expect(result.hasBotMention).toBe(true);
      expect(result.messageUrl).toBeNull();
      expect(result.rawText).toBe(text);
    });

    it('should parse message with only URL (no mention)', () => {
      const text =
        '<https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709>';
      const result = parseSlackMessageText(text);

      expect(result.hasBotMention).toBe(false);
      expect(result.messageUrl).toBe(
        'https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709',
      );
      expect(result.rawText).toBe(text);
    });

    it('should parse plain message', () => {
      const text = 'hello world';
      const result = parseSlackMessageText(text);

      expect(result.hasBotMention).toBe(false);
      expect(result.messageUrl).toBeNull();
      expect(result.rawText).toBe(text);
    });
  });

  describe('isEmailSendRequest', () => {
    it('should return true for message with bot mention and URL', () => {
      const text =
        '<@U0A5R34GCJU> <https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709>';
      expect(isEmailSendRequest(text)).toBe(true);
    });

    it('should return true when URL comes before mention', () => {
      const text =
        '<https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709> <@U0A5R34GCJU>';
      expect(isEmailSendRequest(text)).toBe(true);
    });

    it('should return false for message with only mention', () => {
      expect(isEmailSendRequest('<@U0A5R34GCJU> hello')).toBe(false);
    });

    it('should return false for message with only URL', () => {
      const text =
        '<https://workspace.slack.com/archives/C08TAQ4AX40/p1767851253322709>';
      expect(isEmailSendRequest(text)).toBe(false);
    });

    it('should return false for plain message', () => {
      expect(isEmailSendRequest('hello world')).toBe(false);
    });
  });

  describe('isTemplateRequest', () => {
    it('should return true for "@bot template"', () => {
      expect(isTemplateRequest('<@U0A5R34GCJU> template')).toBe(true);
    });

    it('should return true for "template @bot"', () => {
      expect(isTemplateRequest('template <@U0A5R34GCJU>')).toBe(true);
    });

    it('should return true case insensitively', () => {
      expect(isTemplateRequest('<@U0A5R34GCJU> TEMPLATE')).toBe(true);
      expect(isTemplateRequest('<@U0A5R34GCJU> Template')).toBe(true);
    });

    it('should return true with extra text', () => {
      expect(
        isTemplateRequest('<@U0A5R34GCJU> please give me a template'),
      ).toBe(true);
    });

    it('should return false without bot mention', () => {
      expect(isTemplateRequest('template')).toBe(false);
    });

    it('should return false without template keyword', () => {
      expect(isTemplateRequest('<@U0A5R34GCJU> hello')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isTemplateRequest('')).toBe(false);
    });

    it('should not match partial word "templates"', () => {
      // "template" as a word boundary should match
      expect(isTemplateRequest('<@U0A5R34GCJU> templates')).toBe(false);
    });
  });
});
