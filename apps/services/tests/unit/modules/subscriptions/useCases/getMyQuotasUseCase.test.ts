// Mock subscriptionsConfig — default to freemium for backward-compatible tests
jest.mock('../../../../../src/shared/configs/subscriptionsConfig.js', () => ({
  subscriptionsConfig: {
    signupMode: 'freemium',
    freeTrialDays: 14,
    strictEntitlementsOnPastDue: false,
  },
}));


import type { ISubscriptionRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { IUsageCounterRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iUsageCounterRepository.js';
import type { SubscriptionWithPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionWithPlanEntity.js';
import type { SubscriptionEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';
import { GetMyQuotasUseCase } from '../../../../../src/modules/subscriptions/useCases/getMyQuotasUseCase.js';

const proSub: SubscriptionWithPlanEntity = {
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
  trial_ends_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  plan_code: 'pro',
};

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
  trial_ends_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
};

function makeSubscriptionRepo(sub: SubscriptionWithPlanEntity | null = proSub): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn(),
    findByIdAndScope: jest.fn(),
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(sub),
    findPlanByCode: jest.fn().mockResolvedValue(freePlan),
    findMostExpensiveActivePlan: jest.fn().mockResolvedValue(null),
    transitionExpiredTrials: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(createdFreeSub),
    setCancelAtPeriodEnd: jest.fn(),
    cancelImmediately: jest.fn(),
  };
}

function makeCounterRepo(countReturn = 0): IUsageCounterRepository {
  return {
    incrementAndReturn: jest.fn(),
    incrementByAndReturn: jest.fn(),
    adjustCount: jest.fn(),
    findCount: jest.fn().mockResolvedValue(countReturn),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T022 — R008, R009
describe('GetMyQuotasUseCase — normal state (R008, R009)', () => {
  it('WHEN count is below soft_limit THEN returns quota with state = normal', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(10); // 10 < 800 (pro soft_limit)
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result).toHaveLength(1);
    const quota = result[0]!;
    expect(quota.name).toBe('api_requests');
    expect(quota.count).toBe(10);
    expect(quota.soft_limit).toBe(800);
    expect(quota.hard_limit).toBe(1000);
    expect(quota.period_start).toBe(proSub.current_period_start);
    expect(quota.period_end).toBe(proSub.current_period_end);
    expect(quota.state).toBe('normal');
  });
});

// T023 — R009
describe('GetMyQuotasUseCase — soft and hard exceeded states (R009)', () => {
  it('WHEN count > soft_limit and <= hard_limit THEN state is soft_exceeded', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(900); // 900 > 800, <= 1000
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result[0]!.state).toBe('soft_exceeded');
  });

  it('WHEN count > hard_limit THEN state is hard_exceeded', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(1001); // 1001 > 1000
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result[0]!.state).toBe('hard_exceeded');
  });

  it('WHEN count equals soft_limit THEN state is normal (not exceeded until strictly greater)', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(800); // exactly at soft_limit
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result[0]!.state).toBe('normal');
  });

  it('WHEN count equals hard_limit THEN state is soft_exceeded (not hard_exceeded until strictly greater)', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(1000); // exactly at hard_limit
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result[0]!.state).toBe('soft_exceeded');
  });
});

// T024 — R008, EC001
describe('GetMyQuotasUseCase — no active subscription (R008, EC001)', () => {
  it('WHEN findActiveOrWithinPeriodByScope returns null THEN returns quotas based on free plan', async () => {
    const subRepo = makeSubscriptionRepo(null);
    const counterRepo = makeCounterRepo(0);
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result).toHaveLength(1);
    const quota = result[0]!;
    expect(quota.name).toBe('api_requests');
    expect(quota.soft_limit).toBe(80);  // free plan thresholds
    expect(quota.hard_limit).toBe(100);
  });

  it('WHEN no subscription exists THEN period is derived from the current month', async () => {
    const subRepo = makeSubscriptionRepo(null);
    const counterRepo = makeCounterRepo(0);
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result[0]!.period_start).toBeTruthy();
    expect(result[0]!.period_end).toBeTruthy();
  });
});

// T025 — R008, EC005
describe('GetMyQuotasUseCase — org scope (R008, EC005)', () => {
  it('WHEN orgId != null THEN findCount is called with userId=null and the provided orgId', async () => {
    const orgSub: SubscriptionWithPlanEntity = { ...proSub, user_id: 'user-001', org_id: 'org-001' };
    const subRepo = makeSubscriptionRepo(orgSub);
    const counterRepo = makeCounterRepo(5);
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    await useCase.execute('user-001', 'org-001');

    expect(counterRepo.findCount).toHaveBeenCalledWith(
      null,
      'org-001',
      'api_requests',
      orgSub.current_period_start,
    );
  });
});

// T018 — R010
describe('GetMyQuotasUseCase — unit field in QuotaUsage (R010)', () => {
  it('WHEN execute resolves THEN each item in the returned array has a unit field', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(10);
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    expect(result.length).toBeGreaterThan(0);
    for (const quota of result) {
      expect(quota).toHaveProperty('unit');
      expect(typeof quota.unit).toBe('string');
    }
  });

  it('WHEN the quota is api_requests THEN unit is "request"', async () => {
    const subRepo = makeSubscriptionRepo(proSub);
    const counterRepo = makeCounterRepo(10);
    const useCase = new GetMyQuotasUseCase(subRepo, counterRepo);

    const result = await useCase.execute('user-001', null);

    const apiRequestsQuota = result.find((q) => q.name === 'api_requests');
    expect(apiRequestsQuota).toBeDefined();
    expect(apiRequestsQuota!.unit).toBe('request');
  });
});
