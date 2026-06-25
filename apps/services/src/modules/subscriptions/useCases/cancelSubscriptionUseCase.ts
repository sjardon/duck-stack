import type { PaymentProvider } from '@repo/types';
import { NotFoundError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';
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
        // Non-critical silent fail: the subscription is already cancelled locally. A 400 from the provider
        // means the provider rejected the cancel (e.g. already cancelled on its side). We log at warn
        // and return the locally-updated record so the caller observes a successful cancel. (R010, R013)
        logger.warn({ err }, 'CancelSubscriptionUseCase: provider cancel rejected (400), returning local result');
        return updated;
      }
      // R007, R009: log at error for unexpected failures before re-throwing
      logger.error({ err }, 'CancelSubscriptionUseCase: provider cancel failed with unexpected error');
      throw err;
    }

    return updated;
  }
}
