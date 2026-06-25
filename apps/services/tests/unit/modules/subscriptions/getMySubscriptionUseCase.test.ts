import { GetMySubscriptionUseCase } from '../../../../src/modules/subscriptions/useCases/getMySubscriptionUseCase.js';
import type { ISubscriptionRepository } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

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
    findActiveByScopeStatus: jest.fn().mockResolvedValue(activeSubscription),
    findByIdAndScope: jest.fn().mockResolvedValue(null),
    findPlanByCode: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    setCancelAtPeriodEnd: jest.fn(),
    cancelImmediately: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
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
