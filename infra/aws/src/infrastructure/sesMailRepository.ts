import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type {
  Email,
  EmailAddress,
  MailRepository,
  SendContext,
} from '@rindrics/slackmail';
import nodemailer from 'nodemailer';

/**
 * SES-based implementation of MailRepository using nodemailer.
 *
 * Uses AWS SES via nodemailer's SES transport to send emails.
 * Validates sender addresses against the tenant's configured domain.
 */
export class SESMailRepository implements MailRepository {
  private readonly sesClient: SESv2Client;

  /**
   * Create a new SESMailRepository.
   *
   * @param config - Configuration object
   * @param config.sesClient - Optional SESv2Client instance (defaults to new client)
   */
  constructor(config?: { sesClient?: SESv2Client }) {
    this.sesClient = config?.sesClient ?? new SESv2Client({});
  }

  /**
   * Send an email via AWS SES.
   *
   * @param email - The email to send
   * @param context - SendContext containing tenant and domain information
   * @returns Message ID from SES
   * @throws {Error} If sender domain is invalid or SES send fails
   */
  async sendEmail(email: Email, context: SendContext): Promise<string> {
    // Validate sender domain against tenant's domain
    this.validateSenderDomain(email.from, context);

    // Build MIME message with nodemailer
    const transporter = nodemailer.createTransport({
      streamTransport: true,
    });

    try {
      // Generate the raw MIME message
      const info = await transporter.sendMail({
        from: this.formatEmailAddress(email.from),
        to: email.to.map((addr) => this.formatEmailAddress(addr)),
        cc: email.cc?.map((addr) => this.formatEmailAddress(addr)),
        bcc: email.bcc?.map((addr) => this.formatEmailAddress(addr)),
        replyTo: email.replyTo
          ? this.formatEmailAddress(email.replyTo)
          : undefined,
        subject: email.subject,
        text: email.body.text,
        html: email.body.html,
        inReplyTo: email.inReplyTo,
        references: email.references,
        messageId: email.messageId,
      });

      // Read the raw message from the stream
      const chunks: Buffer[] = [];
      for await (const chunk of info.message) {
        chunks.push(chunk);
      }
      const rawMessage = Buffer.concat(chunks);

      // Send via SES
      const command = new SendEmailCommand({
        Content: {
          Raw: {
            Data: rawMessage,
          },
        },
      });

      const result = await this.sesClient.send(command);
      return result.MessageId ?? email.messageId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to send email via SES: ${errorMessage}`);
    }
  }

  /**
   * Validate that sender address matches the tenant's domain.
   *
   * @param sender - Sender email address
   * @param context - SendContext containing tenant domain information
   * @throws {Error} If sender domain doesn't match tenant's domain
   */
  private validateSenderDomain(
    sender: EmailAddress,
    context: SendContext,
  ): void {
    const senderDomainPart = sender.address.split('@')[1];

    if (!senderDomainPart) {
      throw new Error(
        `Invalid sender address: ${sender.address}. Missing domain part.`,
      );
    }

    // Check if domain is verified
    if (context.domain.verificationStatus !== 'verified') {
      throw new Error(
        `Domain ${context.domain.domain} is not verified. Status: ${context.domain.verificationStatus}`,
      );
    }

    // Validate sender domain matches tenant's domain
    if (senderDomainPart !== context.domain.domain) {
      throw new Error(
        `Invalid sender domain: ${senderDomainPart}. Must be @${context.domain.domain}`,
      );
    }
  }

  /**
   * Format email address for nodemailer.
   * Includes display name if provided.
   *
   * @param address - Email address object
   * @returns Formatted address string (e.g., "Name <email@example.com>")
   */
  private formatEmailAddress(address: EmailAddress): string {
    if (address.name) {
      return `${address.name} <${address.address}>`;
    }
    return address.address;
  }
}
