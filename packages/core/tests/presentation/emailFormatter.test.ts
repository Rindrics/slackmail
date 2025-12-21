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
  });
});
