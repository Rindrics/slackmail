import type { Email, EmailAddress } from './email';
import { createEmail } from './email';

export interface EmailParser {
  parse(raw: string | Buffer): Promise<Email>;
}

/**
 * Parse email address string like "Name <address@example.com>" or "address@example.com"
 */
export function parseEmailAddress(input: string): EmailAddress {
  const match = input.match(/^(?:(.+?)\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim(),
      address: match[2],
    };
  }
  return { address: input.trim() };
}

/**
 * Parse multiple email addresses separated by comma.
 *
 * LIMITATION: This implementation naively splits on commas, which breaks
 * quoted display names containing commas (RFC 5322 allows this).
 *
 * Example of input that will be mis-parsed:
 *   "Doe, John" <john@example.com>, jane@example.com
 *   -> Incorrectly parsed as 3 addresses: ["Doe", "John" <john@example.com>, jane@example.com]
 *
 * For production use with complex email addresses, consider using a robust
 * RFC 5322-compliant parser such as:
 *   - mailparser (https://www.npmjs.com/package/mailparser)
 *   - email-addresses (https://www.npmjs.com/package/email-addresses)
 */
export function parseEmailAddresses(input: string): EmailAddress[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(parseEmailAddress);
}

/**
 * Simple email parser for basic RFC 5322 formatted emails.
 * For production use, consider using a library like mailparser.
 */
export class SimpleEmailParser implements EmailParser {
  async parse(raw: string | Buffer): Promise<Email> {
    const content = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const [headerSection, ...bodyParts] = content.split(/\r?\n\r?\n/);
    const body = bodyParts.join('\n\n');

    const headers = this.parseHeaders(headerSection);

    const fromHeader = headers.get('from') ?? '';
    const toHeader = headers.get('to') ?? '';
    const ccHeader = headers.get('cc');
    const subject = headers.get('subject') ?? '(no subject)';
    const messageId = headers.get('message-id') ?? this.generateMessageId();
    const dateHeader = headers.get('date');
    const inReplyTo = headers.get('in-reply-to');
    const referencesHeader = headers.get('references');

    return createEmail({
      messageId: messageId.replace(/^<|>$/g, ''),
      from: parseEmailAddress(fromHeader),
      to: parseEmailAddresses(toHeader),
      cc: ccHeader ? parseEmailAddresses(ccHeader) : undefined,
      subject,
      body: { text: body },
      date: dateHeader ? new Date(dateHeader) : new Date(),
      inReplyTo: inReplyTo?.replace(/^<|>$/g, ''),
      references: referencesHeader
        ?.split(/\s+/)
        .map((r) => r.replace(/^<|>$/g, '')),
    });
  }

  private parseHeaders(headerSection: string): Map<string, string> {
    const headers = new Map<string, string>();
    const lines = headerSection.split(/\r?\n/);
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation of previous header
        currentValue += ` ${line.trim()}`;
      } else {
        // Save previous header
        if (currentKey) {
          headers.set(currentKey.toLowerCase(), currentValue);
        }
        // Start new header
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          currentKey = line.slice(0, colonIndex);
          currentValue = line.slice(colonIndex + 1).trim();
        }
      }
    }
    // Save last header
    if (currentKey) {
      headers.set(currentKey.toLowerCase(), currentValue);
    }

    return headers;
  }

  private generateMessageId(): string {
    return `${Date.now()}.${Math.random().toString(36).slice(2)}@local`;
  }
}
