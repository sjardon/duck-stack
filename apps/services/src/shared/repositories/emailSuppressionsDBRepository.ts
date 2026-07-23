import type { Sql } from 'postgres';
import { DomainError, ProviderError } from '../errors.js';
import { logger } from '../infrastructure/logger.js';
import type { IEmailSuppressionsRepository, SuppressionReason } from './interfaces/iEmailSuppressionsRepository.js';

export class EmailSuppressionsDBRepository implements IEmailSuppressionsRepository {
  constructor(private readonly sql: Sql) {}

  // Shared try/catch/log/duration boilerplate for every query below: DomainErrors pass through
  // unchanged, any other failure is logged with `context` and wrapped as a 502 ProviderError.
  private async guarded<T>(method: string, context: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'EmailSuppressionsDBRepository', method, ...context },
        `EmailSuppressionsDBRepository.${method} failed`,
      );
      throw new ProviderError(`Database error in EmailSuppressionsDBRepository.${method}`, 502, err);
    }
  }

  // R001, R005, NF002: a repeat suppression of an already-listed address updates the existing row
  // instead of erroring or creating a duplicate.
  async upsert(email: string, reason: SuppressionReason): Promise<void> {
    const start = Date.now();
    await this.guarded('upsert', { email }, async () => {
      await this.sql`
        INSERT INTO email_suppressions (email, reason)
        VALUES (${email}, ${reason})
        ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, updated_at = now()
      `;
      logger.info({ duration: Date.now() - start }, 'EmailSuppressionsDBRepository.upsert');
    });
  }

  // R003, NF001: single indexed primary-key lookup, executed once per message right before dispatch.
  async isSuppressed(email: string): Promise<boolean> {
    const start = Date.now();
    return this.guarded('isSuppressed', { email }, async () => {
      const rows = await this.sql`
        SELECT 1
        FROM email_suppressions
        WHERE email = ${email}
        LIMIT 1
      `;
      logger.info({ duration: Date.now() - start }, 'EmailSuppressionsDBRepository.isSuppressed');
      return rows.length > 0;
    });
  }
}
