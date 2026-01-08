import type { Email, EmailAddress } from '@/domain/entities/email';
import type { MailRepository } from '@/domain/repositories/mailRepository';

/**
 * Input data for sending an email
 */
export interface SendMailInput {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  inReplyTo?: string;
  references?: string[];
}

/**
 * Output data after sending an email
 */
export interface SendMailOutput {
  messageId: string;
}

/**
 * Use case for sending emails
 */
export class SendMailUseCase {
  constructor(private readonly mailRepository: MailRepository) {}

  /**
   * Execute the send mail use case
   *
   * @param input - Email data to send
   * @returns Message ID from the mail service
   * @throws {Error} If validation fails or sending fails
   */
  async execute(input: SendMailInput): Promise<SendMailOutput> {
    // Validate input
    this.validate(input);

    // Create Email entity
    const email: Email = {
      messageId: this.generateMessageId(),
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      subject: input.subject,
      body: input.body,
      date: new Date(),
      inReplyTo: input.inReplyTo,
      references: input.references,
    };

    // Send via repository
    const messageId = await this.mailRepository.sendEmail(email);

    return { messageId };
  }

  /**
   * Validate send mail input
   *
   * @param input - Input to validate
   * @throws {Error} If validation fails
   */
  private validate(input: SendMailInput): void {
    // Validate from address
    if (!input.from || !input.from.address) {
      throw new Error('From address is required');
    }

    // Validate to addresses
    if (!input.to || input.to.length === 0) {
      throw new Error('At least one To address is required');
    }

    for (const addr of input.to) {
      if (!addr.address) {
        throw new Error('Invalid To address: address is required');
      }
    }

    // Validate CC addresses if provided
    if (input.cc) {
      for (const addr of input.cc) {
        if (!addr.address) {
          throw new Error('Invalid CC address: address is required');
        }
      }
    }

    // Validate BCC addresses if provided
    if (input.bcc) {
      for (const addr of input.bcc) {
        if (!addr.address) {
          throw new Error('Invalid BCC address: address is required');
        }
      }
    }

    // Validate subject
    if (!input.subject || input.subject.trim() === '') {
      throw new Error('Subject is required');
    }

    // Validate body
    if (!input.body.text && !input.body.html) {
      throw new Error('Email body is required (text or html)');
    }
  }

  /**
   * Generate a unique message ID
   *
   * @returns Message ID in RFC 5322 format
   */
  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `<${timestamp}.${random}@slackmail>`;
  }
}
