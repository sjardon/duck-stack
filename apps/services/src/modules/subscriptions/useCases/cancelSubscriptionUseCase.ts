import type { PaymentProvider } from '@repo/types';
import { NotFoundError, ProviderError } from '../../../shared/errors.js';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { CancelSubscriptionBodyType } from '../dtos/cancelSubscriptionDto.js';
import type { SubscriptionEntity } from '../entities/subscriptionEntity.js';

export class CancelSubscriptionUseCase {
  constructor(
    private readonly repo: ISubscriptionRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async execute(
    userId: string,
    orgId: string | null,
    subscriptionId: string,
    input: CancelSubscriptionBodyType,
  ): Promise<SubscriptionEntity> {
    const subscription = await this.repo.findByIdAndScope(subscriptionId, userId, orgId);
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    let updated: SubscriptionEntity;

    if (input.atPeriodEnd) {
      updated = await this.repo.setCancelAtPeriodEnd(subscriptionId);
    } else {
      updated = await this.repo.cancelImmediately(subscriptionId);
    }

    try {
      if (subscription.provider_subscription_id) {
        await this.provider.cancelSubscription(subscription.provider_subscription_id);
      }
    } catch (err) {
      if (err instanceof ProviderError && err.statusCode === 400) {
        return updated;
      }
      throw err;
    }

    return updated;
  }
}
