import { randomUUID } from 'crypto';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import { subscriptionsConfig } from '../../../shared/configs/subscriptionsConfig.js';
import { logger } from '../../../shared/infrastructure/logger.js';

const PG_UNIQUE_VIOLATION = '23505';

export class CreateTrialSubscriptionUseCase {
  constructor(private readonly repo: ISubscriptionRepository) {}

  async execute(userId: string): Promise<void> {
    // NF002: resolve most expensive active plan at runtime without caching
    const plan = await this.repo.findMostExpensiveActivePlan();

    if (!plan) {
      // NF003: log error and fail silently — user remains without subscription
      logger.error(
        { userId },
        'CreateTrialSubscriptionUseCase: no active plan found; trial creation skipped',
      );
      return;
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + subscriptionsConfig.freeTrialDays * 24 * 60 * 60 * 1000);

    try {
      // R004: create trialing subscription
      await this.repo.create({
        id: randomUUID(),
        user_id: userId,
        org_id: null,
        plan_id: plan.id,
        provider: 'internal',
        provider_subscription_id: null,
        status: 'trialing',
        current_period_start: now.toISOString(),
        current_period_end: trialEndsAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
      });
    } catch (err: unknown) {
      // NF001 / EC008: catch PG unique constraint violation and return silently
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === PG_UNIQUE_VIOLATION
      ) {
        logger.info({ userId }, 'CreateTrialSubscriptionUseCase: duplicate trial insert ignored (idempotent)');
        return;
      }
      throw err;
    }
  }
}
