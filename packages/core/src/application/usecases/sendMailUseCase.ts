import type { Email, EmailAddress } from '@/domain/entities/email';
import type { SendContext } from '@/domain/entities/sendContext';
import type { MailRepository } from '@/domain/repositories/mailRepository';
import type { TenantConfigRepository } from '@/domain/repositories/tenantConfigRepository';

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
 * Context for sending an email from Slack
 */
export interface SendMailContext {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  selectedDomainId?: string; // Optional: if user selected a specific domain
}

/**
 * Output data after sending an email
 */
export interface SendMailOutput {
  messageId: string;
}

/**
 * Use case for sending emails with multi-tenant support
 */
export class SendMailUseCase {
  constructor(
    private readonly mailRepository: MailRepository,
    private readonly tenantConfigRepository: TenantConfigRepository,
  ) {}

  /**
   * Execute the send mail use case
   *
   * @param input - Email data to send
   * @param context - Slack context and tenant information
   * @returns Message ID from the mail service
   * @throws {Error} If validation fails, tenant config not found, or sending fails
   */
  async execute(
    input: SendMailInput,
    context: SendMailContext,
  ): Promise<SendMailOutput> {
    // Validate input
    this.validate(input);

    // Get tenant configuration
    const tenantConfig = await this.tenantConfigRepository.getTenantConfig(
      context.slackTeamId,
    );
    if (!tenantConfig) {
      throw new Error(
        `Tenant configuration not found for team ${context.slackTeamId}`,
      );
    }

    // Get domains for tenant
    const domains = await this.tenantConfigRepository.getDomainsByTeamId(
      context.slackTeamId,
    );
    if (domains.length === 0) {
      throw new Error(
        `No email domains configured for team ${context.slackTeamId}`,
      );
    }

    // Select domain (either specified or first available)
    let selectedDomain = domains[0];
    if (context.selectedDomainId) {
      const found = domains.find(
        (d) => d.domainId === context.selectedDomainId,
      );
      if (!found) {
        throw new Error(
          `Domain ${context.selectedDomainId} not found for team ${context.slackTeamId}`,
        );
      }
      selectedDomain = found;
    }

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

    // Build SendContext
    const sendContext: SendContext = {
      tenantConfig,
      domain: selectedDomain,
      slackTeamId: context.slackTeamId,
      slackChannelId: context.slackChannelId,
      slackUserId: context.slackUserId,
    };

    // Send via repository
    const messageId = await this.mailRepository.sendEmail(email, sendContext);

    // Log the email send (with 90-day TTL)
    const ttlDate = new Date();
    ttlDate.setDate(ttlDate.getDate() + 90);
    const emailLog = {
      messageId,
      teamId: context.slackTeamId,
      channelId: context.slackChannelId,
      userId: context.slackUserId,
      fromAddress: input.from.address,
      toAddresses: input.to.map((addr) => addr.address),
      subject: input.subject,
      status: 'sent' as const,
      sentAt: new Date(),
      ttl: Math.floor(ttlDate.getTime() / 1000),
    };
    await this.tenantConfigRepository.saveEmailLog(emailLog);

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
