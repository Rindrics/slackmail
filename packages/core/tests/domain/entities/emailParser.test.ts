import { describe, expect, it } from 'vitest';
import {
  SimpleEmailParser,
  parseEmailAddress,
  parseEmailAddresses,
} from '@/domain/entities';

describe('parseEmailAddress', () => {
  it('parses address only', () => {
    const result = parseEmailAddress('test@example.com');
    expect(result).toEqual({ address: 'test@example.com' });
  });

  it('parses name and address', () => {
    const result = parseEmailAddress('John Doe <john@example.com>');
    expect(result).toEqual({ name: 'John Doe', address: 'john@example.com' });
  });

  it('trims whitespace', () => {
    const result = parseEmailAddress('  test@example.com  ');
    expect(result).toEqual({ address: 'test@example.com' });
  });

  it('handles name with special characters', () => {
    const result = parseEmailAddress('"Doe, John" <john@example.com>');
    expect(result).toEqual({
      name: '"Doe, John"',
      address: 'john@example.com',
    });
  });
});

describe('parseEmailAddresses', () => {
  it('parses multiple addresses', () => {
    const result = parseEmailAddresses(
      'alice@example.com, Bob <bob@example.com>',
    );
    expect(result).toEqual([
      { address: 'alice@example.com' },
      { name: 'Bob', address: 'bob@example.com' },
    ]);
  });

  it('returns empty array for empty string', () => {
    const result = parseEmailAddresses('');
    expect(result).toEqual([]);
  });

  it('handles single address', () => {
    const result = parseEmailAddresses('single@example.com');
    expect(result).toEqual([{ address: 'single@example.com' }]);
  });
});

describe('SimpleEmailParser', () => {
  const parser = new SimpleEmailParser();

  it('parses a simple email', async () => {
    const raw = `From: sender@example.com
To: recipient@example.com
Subject: Test Subject
Message-ID: <123@example.com>
Date: Mon, 1 Jan 2024 00:00:00 +0000

Hello, World!`;

    const email = await parser.parse(raw);

    expect(email.from).toEqual({ address: 'sender@example.com' });
    expect(email.to).toEqual([{ address: 'recipient@example.com' }]);
    expect(email.subject).toBe('Test Subject');
    expect(email.messageId).toBe('123@example.com');
    expect(email.body.text).toBe('Hello, World!');
  });

  it('parses email with In-Reply-To and References', async () => {
    const raw = `From: reply@example.com
To: original@example.com
Subject: Re: Test
Message-ID: <456@example.com>
In-Reply-To: <123@example.com>
References: <123@example.com>

This is a reply.`;

    const email = await parser.parse(raw);

    expect(email.inReplyTo).toBe('123@example.com');
    expect(email.references).toEqual(['123@example.com']);
  });

  it('parses email with multiple recipients', async () => {
    const raw = `From: sender@example.com
To: alice@example.com, bob@example.com
Cc: carol@example.com
Subject: Group email
Message-ID: <789@example.com>

Hello everyone!`;

    const email = await parser.parse(raw);

    expect(email.to).toHaveLength(2);
    expect(email.cc).toEqual([{ address: 'carol@example.com' }]);
  });

  it('handles missing optional headers', async () => {
    const raw = `From: sender@example.com
To: recipient@example.com

Body only`;

    const email = await parser.parse(raw);

    expect(email.subject).toBe('(no subject)');
    expect(email.messageId).toBeDefined();
    expect(email.cc).toBeUndefined();
    expect(email.inReplyTo).toBeUndefined();
  });

  it('handles folded headers (multi-line)', async () => {
    const raw = `From: sender@example.com
To: recipient@example.com
Subject: This is a very long subject
 that spans multiple lines
Message-ID: <123@example.com>

Body`;

    const email = await parser.parse(raw);

    expect(email.subject).toBe(
      'This is a very long subject that spans multiple lines',
    );
  });

  it('parses Buffer input', async () => {
    const raw = Buffer.from(`From: sender@example.com
To: recipient@example.com
Subject: Buffer test
Message-ID: <buf@example.com>

Buffer body`);

    const email = await parser.parse(raw);

    expect(email.subject).toBe('Buffer test');
    expect(email.body.text).toBe('Buffer body');
  });

  it('handles multiline body', async () => {
    const raw = `From: sender@example.com
To: recipient@example.com
Subject: Test
Message-ID: <123@example.com>

Line 1

Line 2

Line 3`;

    const email = await parser.parse(raw);

    expect(email.body.text).toBe('Line 1\n\nLine 2\n\nLine 3');
  });
});
