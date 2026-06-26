import type { ISubscriptionRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionWithPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionWithPlanEntity.js';
import type { SubscriptionEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';
import { ensureActiveSubscription } from '../../../../../src/modules/subscriptions/helpers/ensureActiveSubscription.js';

const freePlan: SubscriptionPlanEntity = {
  id: 'plan-free',
  code: 'free',
  name: 'Free',
  description: 'Free plan',
  price: 0,
  currency: 'USD',
  interval: 'month',
  features: [],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
};

const existingSub: SubscriptionWithPlanEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-pro',
  provider: 'mobbex',
  provider_subscription_id: 'prov-sub-001',
  status: 'active',
  current_period_start: '2026-06-01T00:00:00.000Z',
  current_period_end: '2026-07-01T00:00:00.000Z',
  cancel_at_period_end: false,
  canceled_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  plan_code: 'pro',
};

const createdFreeSub: SubscriptionEntity = {
  id: 'sub-free',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-free',
  provider: 'internal',
  provider_subscription_id: null,
  status: 'active',
  current_period_start: '2026-06-01T00:00:00.000Z',
  current_period_end: '2026-07-01T00:00:00.000Z',
  cancel_at_period_end: false,
  canceled_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
};

function makeRepo(overrides: Partial<ISubscriptionRepository> = {}): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
    findByIdAndScope: jest.fn().mockResolvedValue(null),
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(null),
    findPlanByCode: jest.fn().mockResolvedValue(freePlan),
    create: jest.fn().mockResolvedValue(createdFreeSub),
    setCancelAtPeriodEnd: jest.fn(),
    cancelImmediately: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T012 — R007, EC006, EC007
describe('ensureActiveSubscription — existing subscription found (EC006)', () => {
  it('WHEN findActiveOrWithinPeriodByScope returns a subscription THEN returns it without calling create', async () => {
    const repo = makeRepo({
      findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(existingSub),
    });

    const result = await ensureActiveSubscription(repo, 'user-001', null);

    expect(result).toEqual(existingSub);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('ensureActiveSubscription — lazy free subscription creation (R007)', () => {
  it('WHEN no active subscription exists THEN creates a synthetic free subscription and returns it', async () => {
    const repo = makeRepo();

    const result = await ensureActiveSubscription(repo, 'user-001', null);

    expect(repo.findPlanByCode).toHaveBeenCalledWith('free');
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(result.plan_code).toBe('free');
    expect(result.provider).toBe('internal');
    expect(result.status).toBe('active');
  });

  it('WHEN free subscription is created THEN current_period_start and current_period_end are set', async () => {
    const repo = makeRepo();

    const result = await ensureActiveSubscription(repo, 'user-001', null);

    expect(result.current_period_start).toBeTruthy();
    expect(result.current_period_end).toBeTruthy();
  });
});

describe('ensureActiveSubscription — concurrent race condition (EC007)', () => {
  it('WHEN insert fails with unique-constraint violation THEN retries find and returns existing row', async () => {
    const uniqueConstraintError = Object.assign(new Error('unique violation'), { code: '23505' });

    const findMock = jest.fn()
      .mockResolvedValueOnce(null)    // first call: no subscription
      .mockResolvedValueOnce(existingSub); // retry after race: subscription exists

    const repo = makeRepo({
      findActiveOrWithinPeriodByScope: findMock,
      create: jest.fn().mockRejectedValue(uniqueConstraintError),
    });

    const result = await ensureActiveSubscription(repo, 'user-001', null);

    expect(findMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(existingSub);
  });
});
