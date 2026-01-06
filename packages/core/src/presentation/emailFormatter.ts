import type { KnownBlock } from '@slack/web-api';
import { convert } from 'html-to-text';
import type { Email, EmailAddress } from '@/domain/entities';

/**
 * Convert HTML to plain text, handling null/undefined safely
 */
function convertHtmlToText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
  // Trim excessive whitespace and normalize newlines
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Get email body as plain text
 */
function getEmailBodyText(body: Email['body']): string {
  if (body.text) {
    return body.text.trim();
  }
  if (body.html) {
    return convertHtmlToText(body.html);
  }
  return '(no body)';
}

/**
 * Format email address for display
 */
export function formatEmailAddress(address: EmailAddress): string {
  if (address.name) {
    return `${address.name} <${address.address}>`;
  }
  return address.address;
}

/**
 * Format email addresses list for display
 */
export function formatEmailAddresses(addresses: EmailAddress[]): string {
  return addresses.map(formatEmailAddress).join(', ');
}

/**
 * Slack Block Kit character limits
 * Using safety margins to prevent edge cases
 */
const HEADER_TEXT_LIMIT = 140; // Slack limit is 150, using 140 for safety
const BODY_TEXT_LIMIT = 2800; // Slack limit is 3000, using 2800 for safety

/**
 * Truncate text to specified limit, adding ellipsis if truncated
 */
function truncateText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.substring(0, limit - 3)}...`;
}

/**
 * Format email as Slack message blocks
 */
export function formatEmailForSlack(email: Email): {
  text: string;
  blocks: KnownBlock[];
  bodyAsFile?: { content: string; filename: string };
} {
  const fromText = formatEmailAddress(email.from);
  const toText = formatEmailAddresses(email.to);
  const ccText = email.cc ? formatEmailAddresses(email.cc) : undefined;

  const text = `📧 ${email.subject} from ${fromText}`;

  // Truncate subject for header block (Slack limit: 150 chars)
  const headerText = truncateText(`📧 ${email.subject}`, HEADER_TEXT_LIMIT);

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: headerText,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*From:*\n${fromText}`,
        },
        {
          type: 'mrkdwn',
          text: `*To:*\n${toText}`,
        },
      ],
    },
  ];

  if (ccText) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Cc:*\n${ccText}`,
        },
      ],
    });
  }

  const bodyText = getEmailBodyText(email.body);

  // Check if body exceeds Slack limit (3000 chars)
  let bodyAsFile: { content: string; filename: string } | undefined;

  if (bodyText.length > BODY_TEXT_LIMIT) {
    // Body is too long - will be sent as file
    bodyAsFile = {
      content: bodyText,
      filename: `email-body-${email.messageId}.txt`,
    };

    // Show truncated preview in blocks
    const preview = truncateText(bodyText, BODY_TEXT_LIMIT);
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${preview}\n\n_Full email body attached as file._`,
        },
      },
    );
  } else {
    // Body fits in block - display normally
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: bodyText,
        },
      },
    );
  }

  return { text, blocks, bodyAsFile };
}
