export type EventOutcome = 'approved' | 'failed' | 'noop' | 'unresolved';

export interface RecordEventInput {
  eventType: string;
  payload: Record<string, unknown>;
  transactionId: string | null;
}

export interface UpdateTransactionStatusInput {
  providerTransactionId: string | null;
  reference: string | null;
  status: 'approved' | 'failed';
  failureReason?: string;
}

export interface UpdateTransactionStatusResult {
  outcome: EventOutcome;
  transactionId: string | null;
}

export type RefundOutcome =
  | 'refund_approved'
  | 'refund_failed'
  | 'transaction_refunded'
  | 'unresolved'
  | 'noop';

export interface UpsertRefundInput {
  providerTransactionId: string;
  providerRefundId: string;
  amount: number;
  reason: string | null;
  refundStatus: 'approved' | 'failed';
}

export interface UpsertRefundResult {
  outcome: RefundOutcome;
  transactionId: string | null;
}

export interface IMobbexBillingSyncRepository {
  recordEvent(input: RecordEventInput): Promise<void>;
  updateTransactionStatus(input: UpdateTransactionStatusInput): Promise<UpdateTransactionStatusResult>;
  upsertRefundAndMaybeMarkTransactionRefunded(input: UpsertRefundInput): Promise<UpsertRefundResult>;
}
