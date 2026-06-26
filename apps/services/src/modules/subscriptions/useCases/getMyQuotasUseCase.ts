import type { QuotaUsage, QuotaState } from '@repo/types';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { IUsageCounterRepository } from '../repositories/interfaces/iUsageCounterRepository.js';
import { PLAN_QUOTAS } from '../entitlements.js';

export class GetMyQuotasUseCase {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly counterRepo: IUsageCounterRepository,
  ) {}

  async execute(userId: string, orgId: string | null): Promise<QuotaUsage[]> {
    const sub = await this.subscriptionRepo.findActiveOrWithinPeriodByScope(userId, orgId);

    let planCode: string;
    let periodStart: string;
    let periodEnd: string;

    if (sub) {
      planCode = sub.plan_code;
      periodStart = sub.current_period_start!;
      periodEnd = sub.current_period_end!;
    } else {
      // No active subscription: fall back to free plan with a synthetic monthly period
      planCode = 'free';
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      periodStart = start.toISOString();
      periodEnd = end.toISOString();
    }

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
      });
    }

    return results;
  }
}
