import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../entities/subscriptionEntity.js';

export class GetMySubscriptionUseCase {
  constructor(private readonly repo: ISubscriptionRepository) {}

  async execute(userId: string, orgId: string | null): Promise<SubscriptionEntity | null> {
    return this.repo.findActiveByScopeStatus(userId, orgId);
  }
}
