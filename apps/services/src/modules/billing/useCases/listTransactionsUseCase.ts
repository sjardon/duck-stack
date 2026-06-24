import type { BaseLogger } from 'pino';
import { ValidationError } from '../../../shared/errors.js';
import type { ITransactionRepository } from '../repositories/interfaces/iTransactionRepository.js';
import type { TransactionListResponse } from '@repo/types';

export class ListTransactionsUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(
    userId: string,
    orgId: string | null,
    query: { limit: number; cursor?: string },
    logger: BaseLogger,
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
          throw err;
        }
        throw new ValidationError('Invalid cursor');
      }
    }

    const { rows, nextCursor } = await this.repo.list(
      {
        userId,
        orgId,
        limit,
        cursor,
      },
      logger,
    );

    return { data: rows, nextCursor };
  }
}
