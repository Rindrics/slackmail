import { type AddressObject, simpleParser } from 'mailparser';
import type { Email, EmailAddress } from './email';
import { createEmail } from './email';

export interface EmailParser {
  parse(raw: string | Buffer): Promise<Email>;
}

/**
 * Convert mailparser AddressObject to our EmailAddress format
 */
function convertAddress(addr: AddressObject | undefined): EmailAddress[] {
  if (!addr?.value) {
    return [];
  }
  return addr.value.map((a) => ({
    name: a.name || undefined,
    address: a.address || '',
  }));
}

/**
 * Email parser using mailparser library.
 * Properly handles MIME multipart messages, encodings, and attachments.
 *
 * @see ADR 005: Use mailparser for email parsing
 */
export class SimpleEmailParser implements EmailParser {
  async parse(raw: string | Buffer): Promise<Email> {
    const parsed = await simpleParser(raw);

    // Use fallback for missing From header rather than throwing.
    // Malformed emails (e.g., from automated systems or corrupted) may lack From;
    // we prefer resilience over strict validation here.
    const fromAddresses = convertAddress(parsed.from);
    const from: EmailAddress =
      fromAddresses.length > 0 && fromAddresses[0]
        ? fromAddresses[0]
        : { name: undefined, address: '' };
    const to = convertAddress(parsed.to as AddressObject | undefined);
    const cc = convertAddress(parsed.cc as AddressObject | undefined);

    return createEmail({
      messageId:
        parsed.messageId?.replace(/^<|>$/g, '') || this.generateMessageId(),
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject: parsed.subject || '(no subject)',
      body: {
        text: parsed.text || undefined,
        html: parsed.html || undefined,
      },
      date: parsed.date || new Date(),
      inReplyTo: parsed.inReplyTo?.replace(/^<|>$/g, ''),
      references: parsed.references
        ? (Array.isArray(parsed.references)
            ? parsed.references
            : [parsed.references]
          ).map((r) => r.replace(/^<|>$/g, ''))
        : undefined,
    });
  }

  private generateMessageId(): string {
    return `${Date.now()}.${Math.random().toString(36).slice(2)}@local`;
  }
}
