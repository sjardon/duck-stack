import type { FastifyRequest } from 'fastify';
import { subscriptionsConfig } from '../../../shared/configs/subscriptionsConfig.js';
import { TrialExpiredError } from '../../../shared/errors.js';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';

// Module-scope singleton — one instance shared across all requests (R008)
const repo = new SubscriptionDBRepository(db);

/**
 * Global preHandler that blocks expired-trial scopes with HTTP 403 TRIAL_EXPIRED.
 * No-op when signupMode is 'freemium' (R008) or when the request is unauthenticated.
 */
export async function requireActiveSubscription(
  request: FastifyRequest,
): Promise<void> {
  // R009: no-op in freemium mode
  if (subscriptionsConfig.signupMode !== 'free_trial') return;

  // Skip unauthenticated requests — requireAuth handles those separately
  if (!request.userId) return;

  const userId = request.userId;
  const orgId = (request as unknown as { orgId?: string | null }).orgId ?? null;

  // R006: lazily transition any expired trial; capture the transitioned row for its trial_ends_at
  const transitioned = await repo.transitionExpiredTrials(userId, orgId);

  // R007: check whether a non-expired subscription still exists
  const subscription = await repo.findActiveByScopeStatus(userId, orgId);

  if (!subscription) {
    // EC001: trial has expired — use the real trial_ends_at from the transitioned subscription,
    // falling back to now if the transition did not return a row (T034: trial_ends_at ?? now)
    const trialEndedAt = transitioned?.trial_ends_at ?? new Date().toISOString();
    throw new TrialExpiredError(trialEndedAt);
  }
}
