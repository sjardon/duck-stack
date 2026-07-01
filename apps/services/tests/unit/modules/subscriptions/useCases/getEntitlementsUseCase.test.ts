import type { SubscriptionWithPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionWithPlanEntity.js';
import type { ISubscriptionRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';

jest.mock('../../../../../src/shared/configs/subscriptionsConfig.js', () => ({
  subscriptionsConfig: { strictEntitlementsOnPastDue: false },
}));

import { GetEntitlementsUseCase } from '../../../../../src/modules/subscriptions/useCases/getEntitlementsUseCase.js';
import { subscriptionsConfig } from '../../../../../src/shared/configs/subscriptionsConfig.js';

const mockConfig = subscriptionsConfig as { strictEntitlementsOnPastDue: boolean };

function makeRepo(result: SubscriptionWithPlanEntity | null): ISubscriptionRepository {
  return {
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(result),
  } as unknown as ISubscriptionRepository;
}

const baseSubscription: SubscriptionWithPlanEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-001',
  provider: 'mobbex',
  provider_subscription_id: 'prov-sub-001',
  status: 'active',
  current_period_start: '2026-06-24T00:00:00.000Z',
  current_period_end: '2026-07-24T00:00:00.000Z',
  cancel_at_period_end: false,
  canceled_at: null,
  trial_ends_at: null,
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
  plan_code: 'pro',
};

beforeEach(() => {
  mockConfig.strictEntitlementsOnPastDue = false;
});

describe('GetEntitlementsUseCase — EC001: no subscription (R002, R005)', () => {
  it('WHEN repo returns null THEN returns free plan entitlements (empty array)', async () => {
    const repo = makeRepo(null);
    const useCase = new GetEntitlementsUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toEqual([]);
  });
});

describe('GetEntitlementsUseCase — EC003: past_due status (R002)', () => {
  it('WHEN status is past_due and strict mode is true THEN returns free plan entitlements', async () => {
    mockConfig.strictEntitlementsOnPastDue = true;
    const pastDueSub: SubscriptionWithPlanEntity = { ...baseSubscription, status: 'past_due', plan_code: 'pro' };
    const repo = makeRepo(pastDueSub);
    const useCase = new GetEntitlementsUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toEqual([]);
  });

  it('WHEN status is past_due and strict mode is false THEN returns plan entitlements', async () => {
    mockConfig.strictEntitlementsOnPastDue = false;
    const pastDueSub: SubscriptionWithPlanEntity = { ...baseSubscription, status: 'past_due', plan_code: 'pro' };
    const repo = makeRepo(pastDueSub);
    const useCase = new GetEntitlementsUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toContain('advanced_analytics');
    expect(result).toContain('api_access');
  });
});

describe('GetEntitlementsUseCase — EC004: canceled within period (R002)', () => {
  it('WHEN status is canceled with future period end THEN returns plan entitlements', async () => {
    const canceledSub: SubscriptionWithPlanEntity = {
      ...baseSubscription,
      status: 'canceled',
      canceled_at: '2026-06-20T00:00:00.000Z',
      plan_code: 'pro',
    };
    const repo = makeRepo(canceledSub);
    const useCase = new GetEntitlementsUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toContain('advanced_analytics');
    expect(result).toContain('api_access');
  });
});

describe('GetEntitlementsUseCase — active subscription (R002, R005)', () => {
  it('WHEN status is active THEN returns plan entitlements', async () => {
    const repo = makeRepo(baseSubscription);
    const useCase = new GetEntitlementsUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toContain('advanced_analytics');
    expect(result).toContain('priority_support');
    expect(result).toContain('api_access');
  });

  it('WHEN plan_code is business THEN returns business entitlements', async () => {
    const businessSub: SubscriptionWithPlanEntity = { ...baseSubscription, plan_code: 'business' };
    const repo = makeRepo(businessSub);
    const useCase = new GetEntitlementsUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toContain('team_collaboration');
    expect(result).toContain('white_label');
  });
});
