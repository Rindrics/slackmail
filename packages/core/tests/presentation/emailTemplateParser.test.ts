import { describe, it, expect } from 'vitest';
import {
  parseEmailTemplate,
  EmailTemplateParseError,
} from '@/presentation/emailTemplateParser';

describe('parseEmailTemplate', () => {
  it('should parse basic email template', () => {
    const template = `To: recipient@example.com
From: sender@example.com
Subject: Test Subject

This is the email body.`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([{ address: 'recipient@example.com' }]);
    expect(result.from).toEqual({ address: 'sender@example.com' });
    expect(result.subject).toBe('Test Subject');
    expect(result.body).toBe('This is the email body.');
  });

  it('should parse template without From field', () => {
    const template = `To: recipient@example.com
Subject: Test Subject

Email body here.`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([{ address: 'recipient@example.com' }]);
    expect(result.from).toBeUndefined();
    expect(result.subject).toBe('Test Subject');
    expect(result.body).toBe('Email body here.');
  });

  it('should skip From field with (optional) placeholder', () => {
    const template = `To: recipient@example.com
From: (optional)
Subject: Test Subject

Email body here.`;

    const result = parseEmailTemplate(template);

    expect(result.from).toBeUndefined();
  });

  it('should parse multiple To addresses', () => {
    const template = `To: recipient1@example.com, recipient2@example.com, recipient3@example.com
Subject: Test Subject

Email body.`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([
      { address: 'recipient1@example.com' },
      { address: 'recipient2@example.com' },
      { address: 'recipient3@example.com' },
    ]);
  });

  it('should parse email addresses with names', () => {
    const template = `To: John Doe <john@example.com>, Jane Smith <jane@example.com>
From: Sender Name <sender@example.com>
Subject: Test Subject

Email body.`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([
      { name: 'John Doe', address: 'john@example.com' },
      { name: 'Jane Smith', address: 'jane@example.com' },
    ]);
    expect(result.from).toEqual({
      name: 'Sender Name',
      address: 'sender@example.com',
    });
  });

  it('should handle multi-line body', () => {
    const template = `To: recipient@example.com
Subject: Test Subject

Line 1
Line 2
Line 3`;

    const result = parseEmailTemplate(template);

    expect(result.body).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should handle body with blank lines', () => {
    const template = `To: recipient@example.com
Subject: Test Subject

Paragraph 1

Paragraph 2`;

    const result = parseEmailTemplate(template);

    expect(result.body).toBe('Paragraph 1\n\nParagraph 2');
  });

  it('should be case-insensitive for header fields', () => {
    const template = `to: recipient@example.com
from: sender@example.com
subject: Test Subject

Body`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([{ address: 'recipient@example.com' }]);
    expect(result.from).toEqual({ address: 'sender@example.com' });
    expect(result.subject).toBe('Test Subject');
  });

  it('should trim whitespace from fields', () => {
    const template = `To:   recipient@example.com
From:  sender@example.com
Subject:   Test Subject

  Email body with leading/trailing spaces  `;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([{ address: 'recipient@example.com' }]);
    expect(result.from).toEqual({ address: 'sender@example.com' });
    expect(result.subject).toBe('Test Subject');
    expect(result.body).toBe('Email body with leading/trailing spaces');
  });

  it('should throw error if To field is missing', () => {
    const template = `From: sender@example.com
Subject: Test Subject

Body`;

    expect(() => parseEmailTemplate(template)).toThrow(EmailTemplateParseError);
    expect(() => parseEmailTemplate(template)).toThrow(
      'Missing required field: To',
    );
  });

  it('should throw error if Subject field is missing', () => {
    const template = `To: recipient@example.com
From: sender@example.com

Body`;

    expect(() => parseEmailTemplate(template)).toThrow(EmailTemplateParseError);
    expect(() => parseEmailTemplate(template)).toThrow(
      'Missing required field: Subject',
    );
  });

  it('should throw error if blank line separator is missing', () => {
    const template = `To: recipient@example.com
Subject: Test Subject
Body without blank line`;

    expect(() => parseEmailTemplate(template)).toThrow(EmailTemplateParseError);
    expect(() => parseEmailTemplate(template)).toThrow(
      'Missing email body (blank line required after headers)',
    );
  });

  it('should throw error if body is empty', () => {
    const template = `To: recipient@example.com
Subject: Test Subject

`;

    expect(() => parseEmailTemplate(template)).toThrow(EmailTemplateParseError);
    expect(() => parseEmailTemplate(template)).toThrow('Email body is empty');
  });

  it('should throw error if To addresses are invalid', () => {
    const template = `To: not-an-email
Subject: Test Subject

Body`;

    expect(() => parseEmailTemplate(template)).toThrow(EmailTemplateParseError);
    expect(() => parseEmailTemplate(template)).toThrow(
      'No valid To addresses found',
    );
  });

  it('should filter out invalid To addresses but keep valid ones', () => {
    const template = `To: valid@example.com, invalid-email, another@example.com
Subject: Test Subject

Body`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([
      { address: 'valid@example.com' },
      { address: 'another@example.com' },
    ]);
  });

  it('should handle Japanese characters in body', () => {
    const template = `To: recipient@example.com
Subject: Next meeting

How about next Tuesday?`;

    const result = parseEmailTemplate(template);

    expect(result.subject).toBe('Next meeting');
    expect(result.body).toBe('How about next Tuesday?');
  });

  it('should handle names with Japanese characters', () => {
    const template = `To: John Smith <yamada@example.com>
From: Jane Doe <sato@example.com>
Subject: Testing

Body`;

    const result = parseEmailTemplate(template);

    expect(result.to).toEqual([
      { name: 'John Smith', address: 'yamada@example.com' },
    ]);
    expect(result.from).toEqual({
      name: 'Jane Doe',
      address: 'sato@example.com',
    });
  });
});
