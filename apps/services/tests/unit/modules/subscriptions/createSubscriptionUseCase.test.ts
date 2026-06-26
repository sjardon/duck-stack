import { CreateSubscriptionUseCase } from '../../../../src/modules/subscriptions/useCases/createSubscriptionUseCase.js';
import { ValidationError } from '../../../../src/shared/errors.js';
import type { ISubscriptionRepository } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';
import type { PaymentProvider } from '@repo/types';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const freePlan: SubscriptionPlanEntity = {
  id: 'plan-free-001',
  code: 'free',
  name: 'Free',
  description: 'Free plan',
  price: 0,
  currency: 'USD',
  interval: 'month',
  features: [],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

const proPlan: SubscriptionPlanEntity = {
  id: 'plan-pro-001',
  code: 'pro',
  name: 'Pro',
  description: 'Pro plan',
  price: 12,
  currency: 'USD',
  interval: 'month',
  features: [],
  is_active: true,
  provider_plan_id: 'mobbex-plan-pro',
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

const activeSubscription: SubscriptionEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-free-001',
  provider: 'mobbex',
  provider_subscription_id: null,
  status: 'active',
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

function makeRepo(overrides: Partial<ISubscriptionRepository> = {}): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
    findByIdAndScope: jest.fn().mockResolvedValue(null),
    findPlanByCode: jest.fn().mockResolvedValue(freePlan),
    create: jest.fn().mockResolvedValue(activeSubscription),
    setCancelAtPeriodEnd: jest.fn().mockResolvedValue(activeSubscription),
    cancelImmediately: jest.fn().mockResolvedValue(activeSubscription),
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    createCheckout: jest.fn(),
    queryTransaction: jest.fn(),
    createSubscription: jest.fn().mockResolvedValue({
      subscriptionId: 'prov-sub-001',
      checkoutUrl: 'https://mobbex.com/pay/prov-sub-001',
    }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    verifyWebhook: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CreateSubscriptionUseCase — plan not found (R007)', () => {
  it('WHEN planCode does not match an active plan THEN throws ValidationError with status 400', async () => {
    const repo = makeRepo({ findPlanByCode: jest.fn().mockResolvedValue(null) });
    const provider = makeProvider();
    const useCase = new CreateSubscriptionUseCase(repo, provider);

    await expect(useCase.execute('user-001', null, { planCode: 'nonexistent' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });

    expect(repo.create).not.toHaveBeenCalled();
    expect(provider.createSubscription).not.toHaveBeenCalled();
  });
});

describe('CreateSubscriptionUseCase — conflict with existing non-terminal subscription (R006)', () => {
  it('WHEN scope already has a non-terminal subscription THEN throws conflict error with status 409', async () => {
    const repo = makeRepo({
      findPlanByCode: jest.fn().mockResolvedValue(freePlan),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(activeSubscription),
    });
    const provider = makeProvider();
    const useCase = new CreateSubscriptionUseCase(repo, provider);

    await expect(useCase.execute('user-001', null, { planCode: 'free' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 409,
      message: 'user/org already has an active subscription',
    });

    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('CreateSubscriptionUseCase — previous canceled/expired subscription does not block (EC003)', () => {
  it('WHEN previous subscription is canceled THEN creates successfully without 409', async () => {
    const repo = makeRepo({
      findPlanByCode: jest.fn().mockResolvedValue(freePlan),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
    });
    const provider = makeProvider();
    const useCase = new CreateSubscriptionUseCase(repo, provider);

    const result = await useCase.execute('user-001', null, { planCode: 'free' });

    expect(result).toHaveProperty('subscriptionId');
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('CreateSubscriptionUseCase — free plan short-circuit (R004, EC002)', () => {
  it('WHEN plan is free THEN creates subscription with status active and no provider call', async () => {
    const freeSubscription: SubscriptionEntity = { ...activeSubscription, status: 'active', provider_subscription_id: null };
    const repo = makeRepo({
      findPlanByCode: jest.fn().mockResolvedValue(freePlan),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(freeSubscription),
    });
    const provider = makeProvider();
    const useCase = new CreateSubscriptionUseCase(repo, provider);

    const result = await useCase.execute('user-001', null, { planCode: 'free' });

    expect(provider.createSubscription).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        provider_subscription_id: null,
      }),
    );
    expect(result).toHaveProperty('subscriptionId');
    expect(result).not.toHaveProperty('checkoutUrl');
  });
});

describe('CreateSubscriptionUseCase — paid plan calls provider (R005)', () => {
  it('WHEN plan is paid THEN calls provider, creates with status pending, returns checkoutUrl', async () => {
    const pendingSubscription: SubscriptionEntity = {
      ...activeSubscription,
      status: 'pending',
      provider_subscription_id: 'prov-sub-001',
    };
    const repo = makeRepo({
      findPlanByCode: jest.fn().mockResolvedValue(proPlan),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(pendingSubscription),
    });
    const provider = makeProvider();
    const useCase = new CreateSubscriptionUseCase(repo, provider);

    const result = await useCase.execute('user-001', null, { planCode: 'pro' });

    expect(provider.createSubscription).toHaveBeenCalledTimes(1);
    expect(provider.createSubscription).toHaveBeenCalledWith(
      proPlan.provider_plan_id,
      expect.any(String),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        provider_subscription_id: 'prov-sub-001',
      }),
    );
    expect(result).toHaveProperty('checkoutUrl', 'https://mobbex.com/pay/prov-sub-001');
    expect(result).toHaveProperty('subscriptionId');
  });
});
