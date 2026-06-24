import type { RefundStatusValue } from '@repo/types';

export interface RefundEntity {
  id: string;
  transaction_id: string;
  amount: number;
  reason: string | null;
  status: RefundStatusValue;
  provider_refund_id: string;
  created_at: string;
  updated_at: string;
}
