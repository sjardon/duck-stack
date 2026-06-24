import type { BaseLogger } from 'pino';
import type {
  IMobbexBillingSyncRepository,
  EventOutcome,
} from '../repositories/interfaces/iMobbexBillingSyncRepository.js';

const SUCCESS_EVENT_TYPES = new Set(['payment.success', 'checkout.success']);
const FAILURE_EVENT_TYPES = new Set(['payment.failure', 'checkout.failure', 'payment.rejected']);
const REFUND_SUCCESS_EVENT_TYPES = new Set(['refund.success']);
const REFUND_FAILURE_EVENT_TYPES = new Set(['refund.failure']);

// Combined outcome type covers both payment and refund events
type DispatchOutcome = EventOutcome | 'refund_approved' | 'refund_failed' | 'transaction_refunded';

export async function dispatchMobbexEvent(
  payload: Record<string, unknown>,
  repo: IMobbexBillingSyncRepository,
  logger: BaseLogger,
): Promise<DispatchOutcome> {
  const eventType =
    (payload['type'] as string | undefined) ?? (payload['event_type'] as string | undefined) ?? '';

  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {};
  const providerTransactionId = (data['id'] as string | undefined) ?? null;
  const reference = (data['reference'] as string | undefined) ?? null;

  let outcome: DispatchOutcome;
  let resolvedTransactionId: string | null = null;

  if (SUCCESS_EVENT_TYPES.has(eventType)) {
    const result = await repo.updateTransactionStatus({
      providerTransactionId,
      reference,
      status: 'approved',
    }, logger);
    outcome = result.outcome;
    resolvedTransactionId = result.transactionId;
  } else if (FAILURE_EVENT_TYPES.has(eventType)) {
    const failureReason = (data['message'] as string | undefined) ?? '';
    const result = await repo.updateTransactionStatus({
      providerTransactionId,
      reference,
      status: 'failed',
      failureReason,
    }, logger);
    outcome = result.outcome;
    resolvedTransactionId = result.transactionId;
  } else if (REFUND_SUCCESS_EVENT_TYPES.has(eventType) || REFUND_FAILURE_EVENT_TYPES.has(eventType)) {
    // Refund event branch (R002, R003, EC006)
    const providerRefundId = (data['refund_id'] as string | undefined) ?? null;
    const amount = (data['amount'] as number | undefined) ?? null;

    // EC006 — missing or non-positive amount / missing refund_id: skip upsert, record event with null transactionId
    if (!providerRefundId || amount === null || typeof amount !== 'number' || amount <= 0) {
      await repo.recordEvent({ eventType, payload, transactionId: null }, logger);
      return 'unresolved';
    }

    const refundStatus = REFUND_SUCCESS_EVENT_TYPES.has(eventType) ? 'approved' : 'failed';
    const reason = (data['reason'] as string | undefined) ?? null;

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded({
      providerTransactionId: providerTransactionId ?? '',
      providerRefundId,
      amount,
      reason,
      refundStatus,
    }, logger);

    outcome = result.outcome;
    resolvedTransactionId = result.transactionId;
  } else {
    // Unhandled event type — record for audit, no transaction update
    outcome = 'unresolved';
  }

  await repo.recordEvent({
    eventType,
    payload,
    transactionId: resolvedTransactionId,
  }, logger);

  return outcome;
}
