/**
 * Generate an email template for users to fill out in Slack.
 *
 * The template follows this format:
 * To: recipient@example.com
 * From: sender@example.com (optional)
 * Subject: Email subject
 *
 * Email body goes here...
 */
export function generateEmailTemplate(): string {
  return `To:
From: (optional)
Subject:

`;
}
