import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../entities/subscriptionEntity.js';

const MS_PER_DAY = 86400000;

export type SubscriptionEntityWithTrial = SubscriptionEntity & { days_remaining?: number };

export class GetMySubscriptionUseCase {
  constructor(private readonly repo: ISubscriptionRepository) {}

  async execute(userId: string, orgId: string | null): Promise<SubscriptionEntityWithTrial | null> {
    // R006: lazily transition any expired trial before reading
    await this.repo.transitionExpiredTrials(userId, orgId);

    const subscription = await this.repo.findActiveByScopeStatus(userId, orgId);
    if (!subscription) return null;

    // R010: include trial fields when status is trialing
    if (subscription.status === 'trialing' && subscription.trial_ends_at) {
      const daysRemaining = Math.max(
        0,
        Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / MS_PER_DAY),
      );
      return { ...subscription, days_remaining: daysRemaining };
    }

    return subscription;
  }
}
