export type EventOutcome = 'approved' | 'failed' | 'noop' | 'unresolved';

export type SubscriptionSyncOutcome = 'applied' | 'noop' | 'orphan';

export interface RecordEventInput {
  eventType: string;
  payload: Record<string, unknown>;
  transactionId: string | null;
  subscriptionId?: string | null;
  eventId?: string | null;
}

export interface UpdateSubscriptionStatusInput {
  providerSubscriptionId: string;
  eventType: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}

export interface UpdateSubscriptionStatusResult {
  outcome: SubscriptionSyncOutcome;
  subscriptionId: string | null;
  resolvedStatus: string | null;
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
  checkDuplicateEventId(eventId: string, provider: string): Promise<boolean>;
  updateSubscriptionStatus(input: UpdateSubscriptionStatusInput): Promise<UpdateSubscriptionStatusResult>;
}
