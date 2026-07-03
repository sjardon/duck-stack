import type { QuotaUsage, QuotaState } from '@repo/types';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { IUsageCounterRepository } from '../repositories/interfaces/iUsageCounterRepository.js';
import { PLAN_QUOTAS, resolveStrategy } from '../entitlements.js';
import { ensureActiveSubscription } from '../helpers/ensureActiveSubscription.js';

export class GetMyQuotasUseCase {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly counterRepo: IUsageCounterRepository,
  ) {}

  async execute(userId: string, orgId: string | null): Promise<QuotaUsage[]> {
    const sub = await ensureActiveSubscription(this.subscriptionRepo, userId, orgId);

    // R009: in free_trial mode with no subscription, return empty quotas
    if (!sub) return [];

    const planCode = sub.plan_code;
    const periodStart = sub.current_period_start!;
    const periodEnd = sub.current_period_end!;

    const planQuotas = PLAN_QUOTAS[planCode];
    if (!planQuotas || Object.keys(planQuotas).length === 0) return [];

    // EC005: org scope takes precedence
    const counterUserId = orgId !== null ? null : userId;
    const counterOrgId = orgId;

    const results: QuotaUsage[] = [];

    for (const [quotaName, thresholds] of Object.entries(planQuotas)) {
      const count = await this.counterRepo.findCount(
        counterUserId,
        counterOrgId,
        quotaName,
        periodStart,
      );

      // R009: derive state
      let state: QuotaState;
      if (count > thresholds.hard_limit) {
        state = 'hard_exceeded';
      } else if (count > thresholds.soft_limit) {
        state = 'soft_exceeded';
      } else {
        state = 'normal';
      }

      results.push({
        name: quotaName,
        count,
        soft_limit: thresholds.soft_limit,
        hard_limit: thresholds.hard_limit,
        period_start: periodStart,
        period_end: periodEnd,
        state,
        unit: resolveStrategy(quotaName).unit,
      });
    }

    return results;
  }
}
