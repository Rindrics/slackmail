import { describe, expect, it } from 'vitest';
import { createEmail } from '@/domain/entities';
import type { EmailAddress } from '@/domain/entities';

describe('createEmail', () => {
  const from: EmailAddress = { name: 'Sender', address: 'sender@example.com' };
  const to: EmailAddress[] = [{ address: 'recipient@example.com' }];

  it('creates an email with required fields', () => {
    const email = createEmail({
      messageId: '123@example.com',
      from,
      to,
      subject: 'Test Subject',
      body: { text: 'Hello' },
      date: new Date('2024-01-01T00:00:00Z'),
    });

    expect(email.messageId).toBe('123@example.com');
    expect(email.from).toEqual(from);
    expect(email.to).toEqual(to);
    expect(email.subject).toBe('Test Subject');
    expect(email.body.text).toBe('Hello');
    expect(email.date).toEqual(new Date('2024-01-01T00:00:00Z'));
  });

  it('creates an email with optional cc', () => {
    const cc: EmailAddress[] = [{ address: 'cc@example.com' }];

    const email = createEmail({
      messageId: '123@example.com',
      from,
      to,
      cc,
      subject: 'Test',
      body: { text: 'Hello' },
      date: new Date(),
    });

    expect(email.cc).toEqual(cc);
  });

  it('creates an email with html body', () => {
    const email = createEmail({
      messageId: '123@example.com',
      from,
      to,
      subject: 'Test',
      body: { text: 'Hello', html: '<p>Hello</p>' },
      date: new Date(),
    });

    expect(email.body.html).toBe('<p>Hello</p>');
  });

  it('creates an email with inReplyTo and references for threading', () => {
    const email = createEmail({
      messageId: '456@example.com',
      from,
      to,
      subject: 'Re: Test',
      body: { text: 'Reply' },
      date: new Date(),
      inReplyTo: '123@example.com',
      references: ['123@example.com', '000@example.com'],
    });

    expect(email.inReplyTo).toBe('123@example.com');
    expect(email.references).toEqual(['123@example.com', '000@example.com']);
  });
});

