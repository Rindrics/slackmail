import type { EmailAddress } from '../domain/entities/email';

/**
 * Parse an email template message into structured email data.
 *
 * Template format:
 * To: recipient1@example.com, recipient2@example.com
 * From: sender@example.com (optional)
 * Subject: Email subject
 *
 * Email body goes here...
 */

export interface ParsedEmailTemplate {
  to: EmailAddress[];
  from?: EmailAddress;
  subject: string;
  body: string;
}

export class EmailTemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailTemplateParseError';
  }
}

/**
 * Parse an email template from a Slack message.
 *
 * @param text - The message text containing the email template
 * @returns Parsed email data
 * @throws {EmailTemplateParseError} If template format is invalid
 */
export function parseEmailTemplate(text: string): ParsedEmailTemplate {
  const lines = text.split('\n');

  let to: string | undefined;
  let from: string | undefined;
  let subject: string | undefined;
  let bodyStartIndex = -1;

  // Parse headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Empty line marks the end of headers
    if (line === '') {
      bodyStartIndex = i + 1;
      break;
    }

    // Parse header fields
    const toMatch = line.match(/^To:\s*(.+)$/i);
    if (toMatch) {
      to = toMatch[1].trim();
      continue;
    }

    const fromMatch = line.match(/^From:\s*(.+)$/i);
    if (fromMatch) {
      const fromValue = fromMatch[1].trim();
      // Skip if it's just the "(optional)" placeholder
      if (fromValue && fromValue !== '(optional)') {
        from = fromValue;
      }
      continue;
    }

    const subjectMatch = line.match(/^Subject:\s*(.+)$/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
    }
  }

  // Validate required fields
  if (!to) {
    throw new EmailTemplateParseError('Missing required field: To');
  }

  if (!subject) {
    throw new EmailTemplateParseError('Missing required field: Subject');
  }

  if (bodyStartIndex === -1) {
    throw new EmailTemplateParseError(
      'Missing email body (blank line required after headers)',
    );
  }

  // Parse To addresses (comma-separated)
  const toAddresses = to
    .split(',')
    .map((addr) => parseEmailAddress(addr.trim()))
    .filter((addr): addr is EmailAddress => addr !== null);

  if (toAddresses.length === 0) {
    throw new EmailTemplateParseError('No valid To addresses found');
  }

  // Parse From address if provided
  const fromAddress = from ? parseEmailAddress(from) : undefined;

  // Extract body
  const body = lines.slice(bodyStartIndex).join('\n').trim();

  if (!body) {
    throw new EmailTemplateParseError('Email body is empty');
  }

  return {
    to: toAddresses,
    from: fromAddress ?? undefined,
    subject,
    body,
  };
}

/**
 * Parse a single email address string.
 * Supports formats:
 * - email@example.com
 * - Name <email@example.com>
 *
 * @param addressStr - Email address string
 * @returns Parsed EmailAddress or null if invalid
 */
function parseEmailAddress(addressStr: string): EmailAddress | null {
  // Match: Name <email@example.com>
  const namedMatch = addressStr.match(/^(.+?)\s*<(.+?)>$/);
  if (namedMatch) {
    const name = namedMatch[1].trim();
    const address = namedMatch[2].trim();
    if (isValidEmail(address)) {
      return { name, address };
    }
    return null;
  }

  // Match: email@example.com
  const simpleAddress = addressStr.trim();
  if (isValidEmail(simpleAddress)) {
    return { address: simpleAddress };
  }

  return null;
}

/**
 * Basic email validation.
 *
 * @param email - Email address to validate
 * @returns True if email format is valid
 */
function isValidEmail(email: string): boolean {
  // Basic email regex - matches most common email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
