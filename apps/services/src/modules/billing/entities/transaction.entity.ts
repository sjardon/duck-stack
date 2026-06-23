import type { TransactionStatusValue } from '@repo/types';

export interface TransactionEntity {
  id: string;
  user_id: string | null;
  org_id: string | null;
  provider: string;
  provider_transaction_id: string | null;
  amount: number;
  currency: string;
  status: TransactionStatusValue;
  description: string;
  reference: string;
  idempotency_key: string | null;
  metadata: Record<string, unknown> | null;
  failure_reason: string | null;
  checkout_url: string | null;
  created_at: string;
  updated_at: string;
}
