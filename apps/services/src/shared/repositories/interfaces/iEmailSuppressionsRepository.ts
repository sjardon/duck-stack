export type SuppressionReason = 'bounce' | 'complaint';

export interface IEmailSuppressionsRepository {
  upsert(email: string, reason: SuppressionReason): Promise<void>;
  isSuppressed(email: string): Promise<boolean>;
}
