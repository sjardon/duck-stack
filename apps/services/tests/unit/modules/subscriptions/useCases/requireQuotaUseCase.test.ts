import type { ISubscriptionRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { IUsageCounterRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iUsageCounterRepository.js';
import type { SubscriptionWithPlanEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionWithPlanEntity.js';
import { RequireQuotaUseCase } from '../../../../../src/modules/subscriptions/useCases/requireQuotaUseCase.js';
import { QuotaExceededError, ValidationError } from '../../../../../src/shared/errors.js';

// Mock ensureActiveSubscription so we can control its output
const mockEnsureActiveSubscription = jest.fn();
jest.mock('../../../../../src/modules/subscriptions/helpers/ensureActiveSubscription.js', () => ({
  ensureActiveSubscription: (...args: unknown[]) => mockEnsureActiveSubscription(...args),
}));

// Mock resolveStrategy so we can control strategy per test
const mockResolveStrategy = jest.fn();
jest.mock('../../../../../src/modules/subscriptions/entitlements.js', () => {
  const actual = jest.requireActual('../../../../../src/modules/subscriptions/entitlements.js') as Record<string, unknown>;
  return {
    ...actual,
    resolveStrategy: (...args: unknown[]) => mockResolveStrategy(...args),
  };
});

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

const freeSub: SubscriptionWithPlanEntity = {
  ...proSub,
  plan_id: 'plan-free',
  plan_code: 'free',
  provider: 'internal',
  provider_subscription_id: null,
};

function makeSubscriptionRepo(): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn(),
    findByIdAndScope: jest.fn(),
    findActiveOrWithinPeriodByScope: jest.fn(),
    findPlanByCode: jest.fn(),
    findMostExpensiveActivePlan: jest.fn().mockResolvedValue(null),
    transitionExpiredTrials: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    setCancelAtPeriodEnd: jest.fn(),
    cancelImmediately: jest.fn(),
  };
}

function makeCounterRepo(countReturn = 1): IUsageCounterRepository {
  return {
    incrementAndReturn: jest.fn().mockResolvedValue(countReturn),
    incrementByAndReturn: jest.fn().mockResolvedValue(countReturn),
    adjustCount: jest.fn().mockResolvedValue(undefined),
    findCount: jest.fn().mockResolvedValue(countReturn),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default strategy: pre mode, cost 1 (preserves SUBS-006 behavior)
  mockResolveStrategy.mockReturnValue({ unit: 'request', mode: 'pre', compute: () => 1 });
});

// T014 — R006, EC004
describe('RequireQuotaUseCase — unlimited quota (R006, EC004)', () => {
  it('WHEN the plan does not define the quota name THEN execute resolves without calling incrementByAndReturn', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo();
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    // 'unknown_quota' is not defined in PLAN_QUOTAS for 'pro'
    await expect(useCase.execute('user-001', null, 'unknown_quota', {})).resolves.toBeUndefined();
    expect(counterRepo.incrementByAndReturn).not.toHaveBeenCalled();
  });
});

// T015 — R003, R005, EC001, EC002, EC005
describe('RequireQuotaUseCase — within limit (R003, R005, EC001, EC002, EC005)', () => {
  it('WHEN incrementByAndReturn returns a count <= hard_limit THEN execute resolves', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(50); // 50 <= 1000 (pro hard_limit)
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).resolves.toBeUndefined();
  });

  it('WHEN orgId != null THEN counter is incremented against org_id (userId=null) (EC005)', async () => {
    const orgSub: SubscriptionWithPlanEntity = { ...proSub, user_id: 'user-001', org_id: 'org-001' };
    mockEnsureActiveSubscription.mockResolvedValue(orgSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await useCase.execute('user-001', 'org-001', 'api_requests', {});

    expect(counterRepo.incrementByAndReturn).toHaveBeenCalledWith(
      null,
      'org-001',
      'api_requests',
      orgSub.current_period_start,
      1,
    );
  });

  it('WHEN subscription is past_due THEN plan thresholds are evaluated (EC001)', async () => {
    const pastDueSub: SubscriptionWithPlanEntity = { ...proSub, status: 'past_due' };
    mockEnsureActiveSubscription.mockResolvedValue(pastDueSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).resolves.toBeUndefined();
    expect(counterRepo.incrementByAndReturn).toHaveBeenCalledTimes(1);
  });

  it('WHEN subscription is canceled with future period end THEN plan thresholds are evaluated (EC002)', async () => {
    const canceledWithinPeriod: SubscriptionWithPlanEntity = {
      ...proSub,
      status: 'canceled',
      canceled_at: '2026-06-20T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
    };
    mockEnsureActiveSubscription.mockResolvedValue(canceledWithinPeriod);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).resolves.toBeUndefined();
    expect(counterRepo.incrementByAndReturn).toHaveBeenCalledTimes(1);
  });
});

// T016 — R004, EC003
describe('RequireQuotaUseCase — hard limit exceeded (R004, EC003)', () => {
  it('WHEN incrementByAndReturn returns a count > hard_limit THEN throws QuotaExceededError', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1001); // 1001 > 1000 (pro hard_limit)
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('WHEN QuotaExceededError is thrown THEN it carries correct quotaName, count, soft_limit, hard_limit, period_end', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1001);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    let thrown: QuotaExceededError | undefined;
    try {
      await useCase.execute('user-001', null, 'api_requests', {});
    } catch (e) {
      thrown = e as QuotaExceededError;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.quotaName).toBe('api_requests');
    expect(thrown!.count).toBe(1001);
    expect(thrown!.soft_limit).toBe(800);
    expect(thrown!.hard_limit).toBe(1000);
    expect(thrown!.period_end).toBe(proSub.current_period_end);
  });

  it('WHEN count equals hard_limit THEN does not throw (EC003: limit is exceeded when strictly greater)', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1000); // exactly at limit
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).resolves.toBeUndefined();
  });
});

// T017 — R007
describe('RequireQuotaUseCase — lazy free subscription (R007)', () => {
  it('WHEN findActiveOrWithinPeriodByScope returns null THEN ensureActiveSubscription is invoked', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(freeSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(1);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await useCase.execute('user-001', null, 'api_requests', {});

    expect(mockEnsureActiveSubscription).toHaveBeenCalledWith(subRepo, 'user-001', null);
  });

  it('WHEN free subscription is lazily created THEN its plan thresholds are used', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(freeSub);
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(101); // 101 > 100 (free hard_limit)
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).rejects.toBeInstanceOf(QuotaExceededError);
  });
});

// T010 — R003, R004, EC001, EC002, EC003
describe('RequireQuotaUseCase — strategy-aware cost computation (R003, R004, EC001, EC002, EC003)', () => {
  it('WHEN strategy compute returns 0 THEN incrementByAndReturn is not called and quotaReservations is not set (EC001)', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    mockResolveStrategy.mockReturnValue({ unit: 'request', mode: 'pre', compute: () => 0 });
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(0);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);
    const request: Record<string, unknown> = {};

    await useCase.execute('user-001', null, 'api_requests', request);

    expect(counterRepo.incrementByAndReturn).not.toHaveBeenCalled();
    expect(request.quotaReservations).toBeUndefined();
  });

  it('WHEN compute returns -1 THEN ValidationError is thrown before DB call (EC002)', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    mockResolveStrategy.mockReturnValue({ unit: 'request', mode: 'pre', compute: () => -1 });
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(0);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).rejects.toBeInstanceOf(ValidationError);
    expect(counterRepo.incrementByAndReturn).not.toHaveBeenCalled();
  });

  it('WHEN compute returns a non-integer THEN ValidationError is thrown (EC002)', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    mockResolveStrategy.mockReturnValue({ unit: 'request', mode: 'pre', compute: () => 1.5 });
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(0);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).rejects.toBeInstanceOf(ValidationError);
    expect(counterRepo.incrementByAndReturn).not.toHaveBeenCalled();
  });

  it('WHEN compute returns a cost exceeding hard_limit THEN QuotaExceededError is thrown before DB call (EC003)', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    mockResolveStrategy.mockReturnValue({ unit: 'request', mode: 'pre', compute: () => 9999 });
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(0);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);

    await expect(useCase.execute('user-001', null, 'api_requests', {})).rejects.toBeInstanceOf(QuotaExceededError);
    expect(counterRepo.incrementByAndReturn).not.toHaveBeenCalled();
  });

  it('WHEN mode is post THEN request.quotaReservations[name] is set with reserved and charged equal to cost (R004)', async () => {
    mockEnsureActiveSubscription.mockResolvedValue(proSub);
    mockResolveStrategy.mockReturnValue({ unit: 'token', mode: 'post', compute: () => 5 });
    const subRepo = makeSubscriptionRepo();
    const counterRepo = makeCounterRepo(5);
    const useCase = new RequireQuotaUseCase(subRepo, counterRepo);
    const request: Record<string, unknown> = {};

    await useCase.execute('user-001', null, 'api_requests', request);

    const reservations = request.quotaReservations as Record<string, { reserved: number; charged: number }>;
    expect(reservations).toBeDefined();
    expect(reservations['api_requests']).toBeDefined();
    expect(reservations['api_requests']!.reserved).toBe(5);
    expect(reservations['api_requests']!.charged).toBe(5);
  });
});
