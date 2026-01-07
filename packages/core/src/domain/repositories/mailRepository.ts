import type { Email } from '../entities/email';

/**
 * Repository interface for sending emails via mail service (e.g., SES).
 *
 * This interface abstracts the email sending mechanism, allowing different
 * implementations (SES, SendGrid, SMTP, etc.) while keeping the domain layer
 * independent of infrastructure details.
 */
export interface MailRepository {
  /**
   * Send an email via the configured mail service.
   *
   * @param email - The email to send
   * @returns Message ID from the mail service
   * @throws {Error} If sending fails (e.g., invalid sender, rate limit, service error)
   *
   * @example
   * ```typescript
   * const messageId = await mailRepository.sendEmail({
   *   messageId: generateMessageId(),
   *   from: { address: 'sender@example.com' },
   *   to: [{ address: 'recipient@example.com' }],
   *   subject: 'Hello',
   *   body: { text: 'Hello, world!' },
   *   date: new Date(),
   * });
   * ```
   */
  sendEmail(email: Email): Promise<string>;
}
