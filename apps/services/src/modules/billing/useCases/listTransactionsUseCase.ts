import { ValidationError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import type { ITransactionRepository } from '../repositories/interfaces/iTransactionRepository.js';
import type { TransactionListResponse } from '@repo/types';

export class ListTransactionsUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(
    userId: string,
    orgId: string | null,
    query: { limit: number; cursor?: string },
  ): Promise<TransactionListResponse> {
    const { limit, cursor } = query;

    // EC007: validate cursor format before passing to repository
    if (cursor !== undefined) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded) as unknown;
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('created_at' in parsed) ||
          !('id' in parsed)
        ) {
          throw new ValidationError('Invalid cursor');
        }
      } catch (err) {
        if (err instanceof ValidationError) {
          // R007, R008: log at warn before re-throwing — cursor is non-sensitive (no PII)
          logger.warn({ err }, 'ListTransactionsUseCase: invalid cursor (re-throwing)');
          throw err;
        }
        // R007, R008: log at warn before throwing transformed ValidationError
        logger.warn({ err }, 'ListTransactionsUseCase: cursor decode/parse failed, throwing ValidationError');
        throw new ValidationError('Invalid cursor', err instanceof Error ? err : undefined);
      }
    }

    const { rows, nextCursor } = await this.repo.list({
      userId,
      orgId,
      limit,
      cursor,
    });

    return { data: rows, nextCursor };
  }
}
