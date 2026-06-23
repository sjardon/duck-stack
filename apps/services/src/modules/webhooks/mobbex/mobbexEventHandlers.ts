import type {
  IMobbexBillingSyncRepository,
  EventOutcome,
} from '../repositories/interfaces/iMobbexBillingSyncRepository.js';

const SUCCESS_EVENT_TYPES = new Set(['payment.success', 'checkout.success']);
const FAILURE_EVENT_TYPES = new Set(['payment.failure', 'checkout.failure', 'payment.rejected']);

export async function dispatchMobbexEvent(
  payload: Record<string, unknown>,
  repo: IMobbexBillingSyncRepository,
): Promise<EventOutcome> {
  const eventType =
    (payload['type'] as string | undefined) ?? (payload['event_type'] as string | undefined) ?? '';

  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {};
  const providerTransactionId = (data['id'] as string | undefined) ?? null;
  const reference = (data['reference'] as string | undefined) ?? null;

  let outcome: EventOutcome;
  let resolvedTransactionId: string | null = null;

  if (SUCCESS_EVENT_TYPES.has(eventType)) {
    const result = await repo.updateTransactionStatus({
      providerTransactionId,
      reference,
      status: 'approved',
    });
    outcome = result.outcome;
    resolvedTransactionId = result.transactionId;
  } else if (FAILURE_EVENT_TYPES.has(eventType)) {
    const failureReason = (data['message'] as string | undefined) ?? '';
    const result = await repo.updateTransactionStatus({
      providerTransactionId,
      reference,
      status: 'failed',
      failureReason,
    });
    outcome = result.outcome;
    resolvedTransactionId = result.transactionId;
  } else {
    // Unhandled event type — record for audit, no transaction update (EC005)
    outcome = 'unresolved';
  }

  await repo.recordEvent({
    eventType,
    payload,
    transactionId: resolvedTransactionId,
  });

  return outcome;
}
