import crypto from 'node:crypto';
import type { PaymentProvider } from '@repo/types';
import { ValidationError, DomainError } from '../../../shared/errors.js';
import type { ISubscriptionRepository } from '../repositories/interfaces/iSubscriptionRepository.js';
import type { CreateSubscriptionBodyType } from '../dtos/createSubscriptionDto.js';

export class CreateSubscriptionUseCase {
  constructor(
    private readonly repo: ISubscriptionRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async execute(
    userId: string,
    orgId: string | null,
    input: CreateSubscriptionBodyType,
  ): Promise<{ subscriptionId: string; checkoutUrl?: string }> {
    const plan = await this.repo.findPlanByCode(input.planCode);
    if (!plan) {
      throw new ValidationError(`Plan "${input.planCode}" not found or not active`);
    }

    const existing = await this.repo.findActiveByScopeStatus(userId, orgId);
    if (existing) {
      throw new DomainError('VALIDATION_ERROR', 'user/org already has an active subscription', 409);
    }

    const id = crypto.randomUUID();

    if (plan.code === 'free') {
      const subscription = await this.repo.create({
        id,
        user_id: userId,
        org_id: orgId,
        plan_id: plan.id,
        provider: 'mobbex',
        provider_subscription_id: null,
        status: 'active',
        current_period_start: null,
        current_period_end: null,
      });

      return { subscriptionId: subscription.id };
    }

    const { subscriptionId: providerSubscriptionId, checkoutUrl } =
      await this.provider.createSubscription(plan.provider_plan_id!, id);

    const subscription = await this.repo.create({
      id,
      user_id: userId,
      org_id: orgId,
      plan_id: plan.id,
      provider: 'mobbex',
      provider_subscription_id: providerSubscriptionId,
      status: 'pending',
      current_period_start: null,
      current_period_end: null,
    });

    return { checkoutUrl, subscriptionId: subscription.id };
  }
}
