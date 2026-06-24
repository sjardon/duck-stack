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
  create(input: CreateTransactionData): Promise<TransactionEntity>;
  findById(id: string): Promise<TransactionEntity | null>;
  findByIdempotencyKey(
    key: string,
    userId: string,
    orgId: string | null,
  ): Promise<TransactionEntity | null>;
  updateFailureReason(id: string, reason: string): Promise<void>;
  updateProviderData(
    id: string,
    data: { providerTransactionId: string; checkoutUrl: string },
  ): Promise<void>;
  list(query: ListTransactionsQuery): Promise<{ rows: TransactionEntity[]; nextCursor: string | null }>;
  getRefundsByTransactionId(transactionId: string): Promise<RefundEntity[]>;
}
