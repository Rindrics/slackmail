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
 * Format email as Slack message blocks
 */
export function formatEmailForSlack(email: Email): {
  text: string;
  blocks: KnownBlock[];
} {
  const fromText = formatEmailAddress(email.from);
  const toText = formatEmailAddresses(email.to);
  const ccText = email.cc ? formatEmailAddresses(email.cc) : undefined;

  const text = `📧 ${email.subject} from ${fromText}`;

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📧 ${email.subject}`,
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

  return { text, blocks };
}
