import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { IUsageCounterRepository } from '../repositories/interfaces/iUsageCounterRepository.js';
import { PLAN_QUOTAS, resolveStrategy } from '../entitlements.js';
import { ensureActiveSubscription } from '../helpers/ensureActiveSubscription.js';
import { QuotaExceededError, ValidationError } from '../../../shared/errors.js';

export class RequireQuotaUseCase {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly counterRepo: IUsageCounterRepository,
  ) {}

  async execute(userId: string, orgId: string | null, quotaName: string, request: unknown): Promise<void> {
    const sub = await ensureActiveSubscription(this.subscriptionRepo, userId, orgId);

    // R009: in free_trial mode with no subscription, treat as unlimited (no quota enforcement)
    if (!sub) return;

    const planQuotas = PLAN_QUOTAS[sub.plan_code];
    const thresholds = planQuotas?.[quotaName];

    // R006 / EC004: quota not defined for this plan — treat as unlimited
    if (!thresholds) return;

    const strategy = resolveStrategy(quotaName);
    const cost = strategy.compute(request);

    // EC001: zero cost — free operation, skip counter
    if (cost === 0) return;

    // EC002: negative or non-integer cost — programming error
    if (cost < 0 || !Number.isInteger(cost)) {
      throw new ValidationError(`requireQuota: strategy.compute returned invalid cost ${cost} for quota '${quotaName}'`);
    }

    // EC003: cost alone exceeds hard_limit — reject before upsert
    if (cost > thresholds.hard_limit) {
      throw new QuotaExceededError(
        quotaName,
        cost,
        thresholds.soft_limit,
        thresholds.hard_limit,
        sub.current_period_end!,
      );
    }

    const periodStart = sub.current_period_start!;

    // EC005: org scope takes precedence; counter is owned by the org
    const counterUserId = orgId !== null ? null : userId;
    const counterOrgId = orgId;

    const count = await this.counterRepo.incrementByAndReturn(
      counterUserId,
      counterOrgId,
      quotaName,
      periodStart,
      cost,
    );

    // R004: hard limit enforcement after upsert
    if (count > thresholds.hard_limit) {
      throw new QuotaExceededError(
        quotaName,
        count,
        thresholds.soft_limit,
        thresholds.hard_limit,
        sub.current_period_end!,
      );
    }

    // R004: decorate request with reservation info for post mode
    if (strategy.mode === 'post') {
      const req = request as Record<string, unknown>;
      if (!req.quotaReservations) {
        req.quotaReservations = {} as Record<string, { reserved: number; charged: number; rowKey: { userId: string | null; orgId: string | null; periodStart: string } }>;
      }
      (req.quotaReservations as Record<string, { reserved: number; charged: number; rowKey: { userId: string | null; orgId: string | null; periodStart: string } }>)[quotaName] = {
        reserved: cost,
        charged: cost,
        rowKey: { userId: counterUserId, orgId: counterOrgId, periodStart },
      };
    }
  }
}
