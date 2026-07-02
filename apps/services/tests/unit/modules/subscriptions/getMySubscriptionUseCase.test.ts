import { GetMySubscriptionUseCase } from '../../../../src/modules/subscriptions/useCases/getMySubscriptionUseCase.js';
import type { ISubscriptionRepository } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

// Extend interface for response type from use case
type SubscriptionResponse = SubscriptionEntity & { days_remaining?: number } | null;

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
  trial_ends_at: null,
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

function makeRepo(overrides: Partial<ISubscriptionRepository> = {}): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn().mockResolvedValue(activeSubscription),
    findByIdAndScope: jest.fn().mockResolvedValue(null),
    findPlanByCode: jest.fn().mockResolvedValue(null),
    findMostExpensiveActivePlan: jest.fn().mockResolvedValue(null),
    transitionExpiredTrials: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    setCancelAtPeriodEnd: jest.fn(),
    cancelImmediately: jest.fn(),
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T029 — R006, R010: trial fields and lazy transition
const futureDateIso = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
const pastDateIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

const trialSubscription: SubscriptionEntity = {
  id: 'sub-trial-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-enterprise',
  provider: 'internal',
  provider_subscription_id: null,
  status: 'trialing',
  current_period_start: new Date().toISOString(),
  current_period_end: futureDateIso,
  cancel_at_period_end: false,
  canceled_at: null,
  trial_ends_at: futureDateIso,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const expiredTrialSubscription: SubscriptionEntity = {
  ...trialSubscription,
  id: 'sub-expired-001',
  status: 'expired',
  trial_ends_at: pastDateIso,
};

describe('GetMySubscriptionUseCase — trial fields and lazy transition (R006, R010)', () => {
  it('WHEN subscription has status trialing THEN use case calls transitionExpiredTrials first', async () => {
    const repo = makeRepo({
      transitionExpiredTrials: jest.fn().mockResolvedValue(null),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(trialSubscription),
    });
    const useCase = new GetMySubscriptionUseCase(repo);

    await useCase.execute('user-001', null);

    expect(repo.transitionExpiredTrials).toHaveBeenCalledWith('user-001', null);
  });

  it('WHEN subscription has status trialing THEN use case returns trial_ends_at and days_remaining >= 0', async () => {
    const repo = makeRepo({
      transitionExpiredTrials: jest.fn().mockResolvedValue(null),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(trialSubscription),
    });
    const useCase = new GetMySubscriptionUseCase(repo);

    const result = await useCase.execute('user-001', null) as SubscriptionResponse;

    expect(result).not.toBeNull();
    expect((result as SubscriptionEntity).trial_ends_at).toBe(futureDateIso);
    expect((result as { days_remaining?: number }).days_remaining).toBeGreaterThanOrEqual(0);
  });

  it('WHEN trial_ends_at is in the past and transition flips status to expired THEN result is the expired entity', async () => {
    const repo = makeRepo({
      transitionExpiredTrials: jest.fn().mockResolvedValue(expiredTrialSubscription),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(expiredTrialSubscription),
    });
    const useCase = new GetMySubscriptionUseCase(repo);

    const result = await useCase.execute('user-001', null) as SubscriptionResponse;

    expect(result).not.toBeNull();
    expect((result as SubscriptionEntity).status).toBe('expired');
  });

  it('WHEN days_remaining is computed for a trialing subscription THEN it is a non-negative integer', async () => {
    const repo = makeRepo({
      transitionExpiredTrials: jest.fn().mockResolvedValue(null),
      findActiveByScopeStatus: jest.fn().mockResolvedValue(trialSubscription),
    });
    const useCase = new GetMySubscriptionUseCase(repo);

    const result = await useCase.execute('user-001', null) as SubscriptionResponse;

    const daysRemaining = (result as { days_remaining?: number }).days_remaining;
    expect(typeof daysRemaining).toBe('number');
    expect(daysRemaining).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(daysRemaining)).toBe(true);
  });
});

describe('GetMySubscriptionUseCase — returns active subscription (R011)', () => {
  it('WHEN a non-terminal subscription exists for scope THEN returns the entity', async () => {
    const repo = makeRepo();
    const useCase = new GetMySubscriptionUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toEqual(activeSubscription);
    expect(repo.findActiveByScopeStatus).toHaveBeenCalledWith('user-001', null);
  });

  it('WHEN no non-terminal subscription exists THEN returns null', async () => {
    const repo = makeRepo({ findActiveByScopeStatus: jest.fn().mockResolvedValue(null) });
    const useCase = new GetMySubscriptionUseCase(repo);

    const result = await useCase.execute('user-001', null);

    expect(result).toBeNull();
  });

  it('WHEN called with an org scope THEN passes orgId to the repository', async () => {
    const orgSubscription: SubscriptionEntity = { ...activeSubscription, org_id: 'org-001' };
    const repo = makeRepo({ findActiveByScopeStatus: jest.fn().mockResolvedValue(orgSubscription) });
    const useCase = new GetMySubscriptionUseCase(repo);

    const result = await useCase.execute('user-001', 'org-001');

    expect(repo.findActiveByScopeStatus).toHaveBeenCalledWith('user-001', 'org-001');
    expect(result).toEqual(orgSubscription);
  });
});
