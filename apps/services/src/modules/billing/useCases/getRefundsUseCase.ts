import type { BaseLogger } from 'pino';
import { NotFoundError, ForbiddenError } from '../../../shared/errors.js';
import type { ITransactionRepository } from '../repositories/interfaces/iTransactionRepository.js';
import type { RefundEntity } from '../entities/refundEntity.js';

export class GetRefundsUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(transactionId: string, userId: string, orgId: string | null, logger: BaseLogger): Promise<RefundEntity[]> {
    const transaction = await this.repo.findById(transactionId, logger);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    // Ownership check — mirrors GetTransactionUseCase (R011)
    if (orgId !== null) {
      if (transaction.org_id !== orgId) {
        throw new ForbiddenError();
      }
    } else {
      if (transaction.user_id !== userId || transaction.org_id !== null) {
        throw new ForbiddenError();
      }
    }

    return this.repo.getRefundsByTransactionId(transactionId, logger);
  }
}
