import { NotFoundError, ForbiddenError } from '../../../shared/errors.js';
import type { ITransactionRepository } from '../repositories/interfaces/iTransactionRepository.js';
import type { TransactionEntity } from '../entities/transactionEntity.js';

export class GetTransactionUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(id: string, userId: string, orgId: string | null): Promise<TransactionEntity> {
    const transaction = await this.repo.findById(id);

    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    // R008, EC005: ownership check — org-scoped or user-scoped
    if (orgId !== null) {
      if (transaction.org_id !== orgId) {
        throw new ForbiddenError();
      }
    } else {
      if (transaction.user_id !== userId || transaction.org_id !== null) {
        throw new ForbiddenError();
      }
    }

    return transaction;
  }
}
