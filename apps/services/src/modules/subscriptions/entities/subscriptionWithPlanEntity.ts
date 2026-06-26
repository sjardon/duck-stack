import type { SubscriptionEntity } from './subscriptionEntity.js';

export interface SubscriptionWithPlanEntity extends SubscriptionEntity {
  plan_code: string;
}
