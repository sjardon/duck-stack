import type { SubscriptionPlanEntity } from '../../entities/subscriptionPlan.entity.js';

export interface ISubscriptionPlanRepository {
  listActive(): Promise<SubscriptionPlanEntity[]>;
}
