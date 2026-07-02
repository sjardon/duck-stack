import { randomUUID } from 'crypto';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionWithPlanEntity } from '../entities/subscriptionWithPlanEntity.js';
import { NotFoundError } from '../../../shared/errors.js';
import { subscriptionsConfig } from '../../../shared/configs/subscriptionsConfig.js';

/**
 * Postgres error code for unique constraint violations.
 * Used to detect the EC007 concurrent-insert race and retry.
 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Ensures the given scope has an active subscription.
 * If no active or within-period subscription is found, lazily creates a synthetic
 * free subscription with provider = 'internal' and a period aligned to the current month.
 *
 * If two concurrent requests race on the insert (EC007), the unique-constraint
 * violation is caught and the now-existing row is returned via a single retry.
 */
export async function ensureActiveSubscription(
  repo: ISubscriptionRepository,
  userId: string,
  orgId: string | null,
): Promise<SubscriptionWithPlanEntity | null> {
  const existing = await repo.findActiveOrWithinPeriodByScope(userId, orgId);

  // R009: in free_trial mode, skip free-plan creation and return existing or null
  if (subscriptionsConfig.signupMode === 'free_trial') {
    return existing ?? null;
  }

  if (existing) return existing;

  const freePlan = await repo.findPlanByCode('free');
  if (!freePlan) {
    throw new NotFoundError('free subscription plan');
  }

  // Compute period bounds aligned to the current month (UTC).
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  try {
    const created = await repo.create({
      id: randomUUID(),
      user_id: userId,
      org_id: orgId,
      plan_id: freePlan.id,
      provider: 'internal',
      provider_subscription_id: null,
      status: 'active',
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
    });

    return { ...created, plan_code: 'free' };
  } catch (err: unknown) {
    // EC007: if a concurrent request already inserted the free subscription,
    // the unique index on subscriptions rejects the second insert. Retry once.
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === PG_UNIQUE_VIOLATION
    ) {
      const retried = await repo.findActiveOrWithinPeriodByScope(userId, orgId);
      if (retried) return retried;
    }
    throw err;
  }
}
