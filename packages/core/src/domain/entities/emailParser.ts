import type { Email } from './email';

/**
 * Interface for parsing raw email content into Email entity.
 * Implementation lives in infrastructure layer to keep domain free of external dependencies.
 *
 * @see ADR 005: Use mailparser for email parsing
 */
export interface EmailParser {
  parse(raw: string | Buffer): Promise<Email>;
}
