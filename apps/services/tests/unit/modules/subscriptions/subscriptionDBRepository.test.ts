import { SubscriptionDBRepository } from '../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';
import type { CreateSubscriptionData } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';

const baseSubscription: SubscriptionEntity = {
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
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

const activePlan: SubscriptionPlanEntity = {
  id: 'plan-001',
  code: 'pro',
  name: 'Pro',
  description: 'Pro plan',
  price: 12,
  currency: 'USD',
  interval: 'month',
  features: [],
  is_active: true,
  provider_plan_id: 'mobbex-plan-001',
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

function makeSqlMock(returnValue: unknown = []) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

describe('SubscriptionDBRepository.findActiveByScopeStatus — filters non-terminal statuses (R001, R002)', () => {
  it('WHEN called for a user scope THEN returns the non-terminal subscription', async () => {
    const { sql } = makeSqlMock([baseSubscription]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveByScopeStatus('user-001', null);

    expect(result).toEqual(baseSubscription);
  });

  it('WHEN no non-terminal subscription exists THEN returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveByScopeStatus('user-001', null);

    expect(result).toBeNull();
  });

  it('WHEN called for an org scope THEN queries by org_id', async () => {
    const orgSub: SubscriptionEntity = { ...baseSubscription, user_id: 'user-001', org_id: 'org-001' };
    const { sql, mockFn } = makeSqlMock([orgSub]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveByScopeStatus('user-001', 'org-001');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(orgSub);
  });
});

describe('SubscriptionDBRepository.findPlanByCode — active plan lookup (R007)', () => {
  it('WHEN called with a code of an active plan THEN returns the plan', async () => {
    const { sql } = makeSqlMock([activePlan]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findPlanByCode('pro');

    expect(result).toEqual(activePlan);
  });

  it('WHEN called with an inactive or unknown code THEN returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findPlanByCode('nonexistent');

    expect(result).toBeNull();
  });
});

describe('SubscriptionDBRepository.create — inserts and returns row (R001)', () => {
  it('WHEN create is called THEN it returns the inserted subscription entity', async () => {
    const { sql } = makeSqlMock([baseSubscription]);
    const repo = new SubscriptionDBRepository(sql as never);

    const input: CreateSubscriptionData = {
      id: 'sub-001',
      user_id: 'user-001',
      org_id: null,
      plan_id: 'plan-001',
      provider: 'mobbex',
      provider_subscription_id: 'prov-sub-001',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
    };

    const result = await repo.create(input);

    expect(result).toEqual(baseSubscription);
  });
});

describe('SubscriptionDBRepository.setCancelAtPeriodEnd — sets cancel_at_period_end (R009)', () => {
  it('WHEN setCancelAtPeriodEnd is called THEN it returns the updated subscription with cancel_at_period_end = true', async () => {
    const updated: SubscriptionEntity = { ...baseSubscription, cancel_at_period_end: true };
    const { sql } = makeSqlMock([updated]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.setCancelAtPeriodEnd('sub-001');

    expect(result).toEqual(updated);
    expect(result.cancel_at_period_end).toBe(true);
  });
});

describe('SubscriptionDBRepository.cancelImmediately — sets status and canceled_at (R010)', () => {
  it('WHEN cancelImmediately is called THEN it returns the subscription with status = canceled and canceled_at set', async () => {
    const canceled: SubscriptionEntity = {
      ...baseSubscription,
      status: 'canceled',
      canceled_at: '2026-06-24T12:00:00.000Z',
    };
    const { sql } = makeSqlMock([canceled]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.cancelImmediately('sub-001');

    expect(result.status).toBe('canceled');
    expect(result.canceled_at).not.toBeNull();
  });
});

describe('SubscriptionDBRepository.findByIdAndScope — scope-checked lookup', () => {
  it('WHEN called with the correct id and scope THEN returns the subscription', async () => {
    const { sql } = makeSqlMock([baseSubscription]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findByIdAndScope('sub-001', 'user-001', null);

    expect(result).toEqual(baseSubscription);
  });

  it('WHEN no matching subscription exists THEN returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findByIdAndScope('sub-999', 'user-001', null);

    expect(result).toBeNull();
  });
});
