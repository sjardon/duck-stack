// Mock subscriptionsConfig so tests can control freeTrialDays without env changes
jest.mock('../../../../../src/shared/configs/subscriptionsConfig.js', () => ({
  subscriptionsConfig: {
    signupMode: 'free_trial',
    freeTrialDays: 14,
    strictEntitlementsOnPastDue: false,
  },
}));

jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CreateTrialSubscriptionUseCase } from '../../../../../src/modules/subscriptions/useCases/createTrialSubscriptionUseCase.js';
import type { ISubscriptionRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';

const expensivePlan: SubscriptionPlanEntity = {
  id: 'plan-enterprise',
  code: 'enterprise',
  name: 'Enterprise',
  description: 'Enterprise plan',
  price: 99,
  currency: 'USD',
  interval: 'month',
  features: [],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

const createdTrialSub: SubscriptionEntity = {
  id: 'sub-trial-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-enterprise',
  provider: 'internal',
  provider_subscription_id: null,
  status: 'trialing',
  current_period_start: '2026-07-01T00:00:00.000Z',
  current_period_end: '2026-07-15T00:00:00.000Z',
  cancel_at_period_end: false,
  canceled_at: null,
  trial_ends_at: '2026-07-15T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

function makeRepo(overrides: Partial<ISubscriptionRepository> = {}): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
    findByIdAndScope: jest.fn().mockResolvedValue(null),
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(null),
    findPlanByCode: jest.fn().mockResolvedValue(null),
    findMostExpensiveActivePlan: jest.fn().mockResolvedValue(expensivePlan),
    transitionExpiredTrials: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(createdTrialSub),
    setCancelAtPeriodEnd: jest.fn(),
    cancelImmediately: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T016 — R004, NF001, NF002: happy path
describe('CreateTrialSubscriptionUseCase — happy path (R004, NF001, NF002)', () => {
  it('WHEN execute is called and findMostExpensiveActivePlan returns a plan THEN create is called with status trialing', async () => {
    const repo = makeRepo();
    const useCase = new CreateTrialSubscriptionUseCase(repo);

    await useCase.execute('user-001');

    expect(repo.findMostExpensiveActivePlan).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledTimes(1);

    const createCall = (repo.create as jest.Mock).mock.calls[0][0];
    expect(createCall.status).toBe('trialing');
    expect(createCall.plan_id).toBe(expensivePlan.id);
    expect(createCall.user_id).toBe('user-001');
    expect(createCall.trial_ends_at).toBeTruthy();
  });

  it('WHEN execute is called THEN trial_ends_at is set to now + freeTrialDays days', async () => {
    const before = Date.now();
    const repo = makeRepo();
    const useCase = new CreateTrialSubscriptionUseCase(repo);

    await useCase.execute('user-001');

    const after = Date.now();
    const createCall = (repo.create as jest.Mock).mock.calls[0][0];
    const trialEndsAt = new Date(createCall.trial_ends_at).getTime();

    const expectedMin = before + 14 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 14 * 24 * 60 * 60 * 1000;

    expect(trialEndsAt).toBeGreaterThanOrEqual(expectedMin);
    expect(trialEndsAt).toBeLessThanOrEqual(expectedMax);
  });

  it('WHEN execute is called THEN current_period_start and current_period_end are set', async () => {
    const repo = makeRepo();
    const useCase = new CreateTrialSubscriptionUseCase(repo);

    await useCase.execute('user-001');

    const createCall = (repo.create as jest.Mock).mock.calls[0][0];
    expect(createCall.current_period_start).toBeTruthy();
    expect(createCall.current_period_end).toBe(createCall.trial_ends_at);
  });
});

// T017 — NF003: no active plan — silent fail
describe('CreateTrialSubscriptionUseCase — no active plan (NF003)', () => {
  it('WHEN findMostExpensiveActivePlan returns null THEN create is never called and no error is thrown', async () => {
    const repo = makeRepo({
      findMostExpensiveActivePlan: jest.fn().mockResolvedValue(null),
    });
    const useCase = new CreateTrialSubscriptionUseCase(repo);

    await expect(useCase.execute('user-001')).resolves.toBeUndefined();
    expect(repo.create).not.toHaveBeenCalled();
  });
});

// T018 — NF001, EC008: duplicate webhook idempotency
describe('CreateTrialSubscriptionUseCase — duplicate webhook idempotency (NF001, EC008)', () => {
  it('WHEN create throws a PG 23505 error THEN the use case catches it and returns without re-throwing', async () => {
    const uniqueViolation = Object.assign(new Error('unique violation'), { code: '23505' });
    const repo = makeRepo({
      create: jest.fn().mockRejectedValue(uniqueViolation),
    });
    const useCase = new CreateTrialSubscriptionUseCase(repo);

    await expect(useCase.execute('user-001')).resolves.toBeUndefined();
  });

  it('WHEN create throws a non-23505 error THEN the use case re-throws it', async () => {
    const dbError = new Error('connection refused');
    const repo = makeRepo({
      create: jest.fn().mockRejectedValue(dbError),
    });
    const useCase = new CreateTrialSubscriptionUseCase(repo);

    await expect(useCase.execute('user-001')).rejects.toThrow('connection refused');
  });
});
