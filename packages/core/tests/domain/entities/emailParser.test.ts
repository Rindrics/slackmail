import { describe, expect, it } from 'vitest';
import { SimpleEmailParser } from '@/domain/entities';

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

  it('parses MIME multipart message', async () => {
    const raw = `From: sender@example.com
To: recipient@example.com
Subject: Multipart Test
Message-ID: <multipart@example.com>
Content-Type: multipart/alternative; boundary="boundary123"

--boundary123
Content-Type: text/plain; charset="UTF-8"

Hello plain text

--boundary123
Content-Type: text/html; charset="UTF-8"

<div>Hello HTML</div>

--boundary123--`;

    const email = await parser.parse(raw);

    expect(email.body.text).toBe('Hello plain text');
    expect(email.body.html).toBe('<div>Hello HTML</div>');
  });

  it('parses email with display name', async () => {
    const raw = `From: John Doe <john@example.com>
To: Jane Doe <jane@example.com>
Subject: Name Test
Message-ID: <name@example.com>

Body`;

    const email = await parser.parse(raw);

    expect(email.from).toEqual({
      name: 'John Doe',
      address: 'john@example.com',
    });
    expect(email.to).toEqual([
      { name: 'Jane Doe', address: 'jane@example.com' },
    ]);
  });
});
