import type { ISubscriptionPlanRepository } from '../repositories/interfaces/iSubscriptionPlanRepository.js';
import type { SubscriptionPlanEntity } from '../entities/subscriptionPlanEntity.js';

export class ListPlansUseCase {
  constructor(private readonly repo: ISubscriptionPlanRepository) {}

  async execute(): Promise<SubscriptionPlanEntity[]> {
    return this.repo.listActive();
  }
}
