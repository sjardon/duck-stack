import type { EntitlementName } from '@repo/types';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import { PLAN_ENTITLEMENTS } from '../entitlements.js';
import { subscriptionsConfig } from '../../../shared/configs/subscriptionsConfig.js';

export class GetEntitlementsUseCase {
  constructor(private readonly repo: ISubscriptionRepository) {}

  async execute(userId: string, orgId: string | null): Promise<EntitlementName[]> {
    const sub = await this.repo.findActiveOrWithinPeriodByScope(userId, orgId);

    if (!sub) return PLAN_ENTITLEMENTS['free'] ?? [];

    if (sub.status === 'past_due' && subscriptionsConfig.strictEntitlementsOnPastDue) {
      return PLAN_ENTITLEMENTS['free'] ?? [];
    }

    return PLAN_ENTITLEMENTS[sub.plan_code] ?? [];
  }
}
