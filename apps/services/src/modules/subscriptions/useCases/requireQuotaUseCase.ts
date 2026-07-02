import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { IUsageCounterRepository } from '../repositories/interfaces/iUsageCounterRepository.js';
import { PLAN_QUOTAS } from '../entitlements.js';
import { ensureActiveSubscription } from '../helpers/ensureActiveSubscription.js';
import { QuotaExceededError } from '../../../shared/errors.js';

export class RequireQuotaUseCase {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly counterRepo: IUsageCounterRepository,
  ) {}

  async execute(userId: string, orgId: string | null, quotaName: string): Promise<void> {
    const sub = await ensureActiveSubscription(this.subscriptionRepo, userId, orgId);

    // R009: in free_trial mode with no subscription, treat as unlimited (no quota enforcement)
    if (!sub) return;

    const planQuotas = PLAN_QUOTAS[sub.plan_code];
    const thresholds = planQuotas?.[quotaName];

    // R006 / EC004: quota not defined for this plan — treat as unlimited
    if (!thresholds) return;

    const periodStart = sub.current_period_start!;

    // EC005: org scope takes precedence; counter is owned by the org
    const counterUserId = orgId !== null ? null : userId;
    const counterOrgId = orgId;

    const count = await this.counterRepo.incrementAndReturn(
      counterUserId,
      counterOrgId,
      quotaName,
      periodStart,
    );

    // R004: hard limit enforcement
    if (count > thresholds.hard_limit) {
      throw new QuotaExceededError(
        quotaName,
        count,
        thresholds.soft_limit,
        thresholds.hard_limit,
        sub.current_period_end!,
      );
    }
  }
}
