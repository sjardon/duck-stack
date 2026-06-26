import type { SubscriptionEntity } from '../../entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../entities/subscriptionPlanEntity.js';
import type { SubscriptionWithPlanEntity } from '../../entities/subscriptionWithPlanEntity.js';

export interface CreateSubscriptionData {
  id: string;
  user_id: string;
  org_id: string | null;
  plan_id: string;
  provider: string;
  provider_subscription_id: string | null;
  status: 'pending' | 'active';
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface ISubscriptionRepository {
  findActiveByScopeStatus(userId: string, orgId: string | null): Promise<SubscriptionEntity | null>;
  findByIdAndScope(id: string, userId: string, orgId: string | null): Promise<SubscriptionEntity | null>;
  findActiveOrWithinPeriodByScope(userId: string, orgId: string | null): Promise<SubscriptionWithPlanEntity | null>;
  findPlanByCode(planCode: string): Promise<SubscriptionPlanEntity | null>;
  create(input: CreateSubscriptionData): Promise<SubscriptionEntity>;
  setCancelAtPeriodEnd(id: string): Promise<SubscriptionEntity>;
  cancelImmediately(id: string): Promise<SubscriptionEntity>;
}
