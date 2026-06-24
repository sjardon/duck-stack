import type { BaseLogger } from 'pino';
import type { TransactionEntity } from '../../entities/transactionEntity.js';
import type { RefundEntity } from '../../entities/refundEntity.js';

export interface CreateTransactionData {
  id: string;
  user_id: string | null;
  org_id: string | null;
  provider: string;
  amount: number;
  currency: string;
  description: string;
  reference: string;
  idempotency_key?: string;
  metadata: Record<string, unknown> | null;
}

export interface ListTransactionsQuery {
  userId: string;
  orgId: string | null;
  limit: number;
  cursor?: string;
}

export interface ITransactionRepository {
  create(input: CreateTransactionData, logger: BaseLogger): Promise<TransactionEntity>;
  findById(id: string, logger: BaseLogger): Promise<TransactionEntity | null>;
  findByIdempotencyKey(
    key: string,
    userId: string,
    orgId: string | null,
    logger: BaseLogger,
  ): Promise<TransactionEntity | null>;
  updateFailureReason(id: string, reason: string, logger: BaseLogger): Promise<void>;
  updateProviderData(
    id: string,
    data: { providerTransactionId: string; checkoutUrl: string },
    logger: BaseLogger,
  ): Promise<void>;
  list(query: ListTransactionsQuery, logger: BaseLogger): Promise<{ rows: TransactionEntity[]; nextCursor: string | null }>;
  getRefundsByTransactionId(transactionId: string, logger: BaseLogger): Promise<RefundEntity[]>;
}
