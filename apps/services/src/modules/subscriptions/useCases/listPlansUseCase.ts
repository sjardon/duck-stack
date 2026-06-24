import type { BaseLogger } from 'pino';
import type { ISubscriptionPlanRepository } from '../repositories/interfaces/iSubscriptionPlanRepository.js';
import type { SubscriptionPlanEntity } from '../entities/subscriptionPlanEntity.js';

export class ListPlansUseCase {
  constructor(private readonly repo: ISubscriptionPlanRepository) {}

  async execute(logger: BaseLogger): Promise<SubscriptionPlanEntity[]> {
    return this.repo.listActive(logger);
  }
}
