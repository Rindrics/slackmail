import { describe, expect, it } from 'vitest';
import type { Email } from '@/domain/entities';
import {
  formatEmailAddress,
  formatEmailAddresses,
  formatEmailForSlack,
} from '@/presentation/emailFormatter';

describe('emailFormatter', () => {
  describe('formatEmailAddress', () => {
    it('should format address with name', () => {
      const result = formatEmailAddress({
        name: 'John Doe',
        address: 'john@example.com',
      });
      expect(result).toBe('John Doe <john@example.com>');
    });

    it('should format address without name', () => {
      const result = formatEmailAddress({
        address: 'john@example.com',
      });
      expect(result).toBe('john@example.com');
    });
  });

  describe('formatEmailAddresses', () => {
    it('should format multiple addresses', () => {
      const result = formatEmailAddresses([
        { name: 'John', address: 'john@example.com' },
        { address: 'jane@example.com' },
      ]);
      expect(result).toBe('John <john@example.com>, jane@example.com');
    });

    it('should handle single address', () => {
      const result = formatEmailAddresses([{ address: 'john@example.com' }]);
      expect(result).toBe('john@example.com');
    });
  });

  describe('formatEmailForSlack', () => {
    const email: Email = {
      messageId: 'test-123',
      from: { name: 'Sender', address: 'sender@example.com' },
      to: [{ address: 'recipient@example.com' }],
      subject: 'Test Subject',
      body: { text: 'Hello, this is a test email.' },
      date: new Date('2025-01-01'),
    };

    it('should return text and blocks', () => {
      const result = formatEmailForSlack(email);

      expect(result.text).toBe(
        '📧 Test Subject from Sender <sender@example.com>',
      );
      expect(result.blocks).toBeDefined();
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it('should include header block with subject', () => {
      const result = formatEmailForSlack(email);

      const headerBlock = result.blocks[0] as {
        type: string;
        text: { text: string };
      };
      expect(headerBlock.type).toBe('header');
      expect(headerBlock.text.text).toBe('📧 Test Subject');
    });

    it('should include from and to fields', () => {
      const result = formatEmailForSlack(email);

      const sectionBlock = result.blocks[1] as {
        type: string;
        fields: { text: string }[];
      };
      expect(sectionBlock.type).toBe('section');
      expect(sectionBlock.fields[0].text).toContain('sender@example.com');
      expect(sectionBlock.fields[1].text).toContain('recipient@example.com');
    });

    it('should include cc when present', () => {
      const emailWithCc: Email = {
        ...email,
        cc: [{ address: 'cc@example.com' }],
      };

      const result = formatEmailForSlack(emailWithCc);

      const ccBlock = result.blocks.find((b) =>
        (b as { fields?: { text: string }[] }).fields?.[0]?.text?.includes(
          'Cc:',
        ),
      );
      expect(ccBlock).toBeDefined();
    });

    it('should include body text', () => {
      const result = formatEmailForSlack(email);

      const bodyBlock = result.blocks.find(
        (b) =>
          (b as { text?: { text: string } }).text?.text ===
          'Hello, this is a test email.',
      );
      expect(bodyBlock).toBeDefined();
    });

    it('should truncate long subject line (>140 chars)', () => {
      const longSubject = 'A'.repeat(200); // 200 characters
      const emailWithLongSubject: Email = {
        ...email,
        subject: longSubject,
      };

      const result = formatEmailForSlack(emailWithLongSubject);

      const headerBlock = result.blocks[0] as {
        type: string;
        text: { text: string };
      };
      expect(headerBlock.type).toBe('header');
      expect(headerBlock.text.text).toHaveLength(140);
      expect(headerBlock.text.text.endsWith('...')).toBe(true);
    });

    it('should return bodyAsFile when body exceeds 2800 chars', () => {
      const longBody = 'Lorem ipsum dolor sit amet. '.repeat(150); // ~4200 characters
      const emailWithLongBody: Email = {
        ...email,
        body: { text: longBody },
      };

      const result = formatEmailForSlack(emailWithLongBody);

      expect(result.bodyAsFile).toBeDefined();
      // Body text is trimmed by getEmailBodyText
      expect(result.bodyAsFile?.content).toBe(longBody.trim());
      expect(result.bodyAsFile?.filename).toBe(
        `email-body-${email.messageId}.txt`,
      );

      // Check that blocks contain truncated preview
      const bodyBlock = result.blocks.find(
        (b) =>
          (b as { text?: { text: string } }).text?.text?.includes(
            'Full email body attached as file.',
          ),
      );
      expect(bodyBlock).toBeDefined();
    });

    it('should not return bodyAsFile when body is within limit', () => {
      const shortBody = 'Short email body.';
      const emailWithShortBody: Email = {
        ...email,
        body: { text: shortBody },
      };

      const result = formatEmailForSlack(emailWithShortBody);

      expect(result.bodyAsFile).toBeUndefined();
    });
  });
});
