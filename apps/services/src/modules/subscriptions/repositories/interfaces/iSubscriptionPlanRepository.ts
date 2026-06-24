import type { BaseLogger } from 'pino';
import type { SubscriptionPlanEntity } from '../../entities/subscriptionPlanEntity.js';

export interface ISubscriptionPlanRepository {
  listActive(logger: BaseLogger): Promise<SubscriptionPlanEntity[]>;
}
