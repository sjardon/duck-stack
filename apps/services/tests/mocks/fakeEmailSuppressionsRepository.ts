import type {
  IEmailSuppressionsRepository,
  SuppressionReason,
} from '../../src/shared/repositories/interfaces/iEmailSuppressionsRepository.js';

export class FakeEmailSuppressionsRepository implements IEmailSuppressionsRepository {
  private readonly reasonsByEmail = new Map<string, SuppressionReason>();

  async upsert(email: string, reason: SuppressionReason): Promise<void> {
    this.reasonsByEmail.set(email, reason);
  }

  async isSuppressed(email: string): Promise<boolean> {
    return this.reasonsByEmail.has(email);
  }
}
