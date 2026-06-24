import type { SubscriptionPlanEntity } from '../../entities/subscriptionPlanEntity.js';

export interface ISubscriptionPlanRepository {
  listActive(): Promise<SubscriptionPlanEntity[]>;
}
