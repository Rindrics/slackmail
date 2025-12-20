import type { Email } from '@/domain/entities';
import type { EmailParser } from '@/domain/entities/emailParser';
import type { StorageRepository } from '@/domain/repositories';

export interface ReceiveMailUseCaseInput {
  storageKey: string;
}

export interface ReceiveMailUseCaseOutput {
  email: Email;
}

export interface ReceiveMailUseCaseDeps {
  storageRepository: StorageRepository;
  emailParser: EmailParser;
  onEmailReceived: (email: Email) => Promise<void>;
}

/**
 * Use case for receiving and processing an email.
 * Flow: Fetch from storage → Parse → Notify via callback
 */
export class ReceiveMailUseCase {
  private readonly storageRepository: StorageRepository;
  private readonly emailParser: EmailParser;
  private readonly onEmailReceived: (email: Email) => Promise<void>;

  constructor(deps: ReceiveMailUseCaseDeps) {
    this.storageRepository = deps.storageRepository;
    this.emailParser = deps.emailParser;
    this.onEmailReceived = deps.onEmailReceived;
  }

  async execute(
    input: ReceiveMailUseCaseInput,
  ): Promise<ReceiveMailUseCaseOutput> {
    const rawEmail = await this.storageRepository.fetchRawEmail(
      input.storageKey,
    );
    const email = await this.emailParser.parse(rawEmail);
    await this.onEmailReceived(email);
    return { email };
  }
}
