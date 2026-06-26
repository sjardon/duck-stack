import type { IMobbexBillingSyncRepository } from '../repositories/interfaces/iMobbexBillingSyncRepository.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export const SUBSCRIPTION_EVENT_TYPES = new Set([
  'subscription.activated',
  'subscription.renewed',
  'subscription.payment_failed',
  'subscription.canceled',
  'subscription.expired',
]);

export type SubscriptionDispatchOutcome = 'applied' | 'noop' | 'orphan' | 'unknown' | 'duplicate';

export async function dispatchMobbexSubscriptionEvent(
  payload: Record<string, unknown>,
  repo: IMobbexBillingSyncRepository,
): Promise<SubscriptionDispatchOutcome> {
  const eventType =
    (payload['type'] as string | undefined) ?? (payload['event_type'] as string | undefined) ?? '';
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {};
  const eventId = (data['event_id'] as string | undefined) ?? null;
  const providerSubscriptionId =
    (data['subscription_id'] as string | undefined) ?? (data['id'] as string | undefined) ?? null;
  const currentPeriodStart = (data['period_start'] as string | undefined) ?? null;
  const currentPeriodEnd = (data['period_end'] as string | undefined) ?? null;

  // R010 / EC005: idempotency check by event_id before any other processing
  if (eventId !== null) {
    const isDuplicate = await repo.checkDuplicateEventId(eventId, 'mobbex');
    if (isDuplicate) {
      logger.warn(
        { event_type: eventType, provider_subscription_id: providerSubscriptionId, subscription_id: null, outcome: 'duplicate' },
        'Mobbex subscription webhook duplicate',
      );
      return 'duplicate';
    }
  }

  // EC004: unknown event type — record for audit but do not mutate subscriptions
  if (!SUBSCRIPTION_EVENT_TYPES.has(eventType)) {
    await repo.recordEvent({ eventType, payload, transactionId: null, subscriptionId: null, eventId });
    logger.warn(
      { event_type: eventType, provider_subscription_id: providerSubscriptionId, subscription_id: null, outcome: 'unknown' },
      'Mobbex subscription webhook unknown event type',
    );
    return 'unknown';
  }

  // Apply state machine transition
  const result = await repo.updateSubscriptionStatus({
    providerSubscriptionId: providerSubscriptionId ?? '',
    eventType,
    currentPeriodStart,
    currentPeriodEnd,
  });

  // R008: persist event with resolved subscription_id
  await repo.recordEvent({
    eventType,
    payload,
    transactionId: null,
    subscriptionId: result.subscriptionId,
    eventId,
  });

  // NF002: structured log for every processing path
  const logFields = {
    event_type: eventType,
    provider_subscription_id: providerSubscriptionId,
    subscription_id: result.subscriptionId,
    outcome: result.outcome,
  };

  if (result.outcome === 'applied') {
    logger.info(logFields, 'Mobbex subscription webhook processed');
  } else {
    logger.warn(logFields, 'Mobbex subscription webhook noop or orphan');
  }

  return result.outcome;
}
