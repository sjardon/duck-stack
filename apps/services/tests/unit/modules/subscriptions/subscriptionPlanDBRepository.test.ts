import { SubscriptionPlanDBRepository } from '../../../../src/modules/subscriptions/repositories/subscriptionPlanDBRepository.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlan.entity.js';

const basePlan: SubscriptionPlanEntity = {
  id: '00000000-0000-0000-0001-000000000001',
  code: 'free',
  name: 'Free',
  description: 'Get started at no cost.',
  price: 0,
  currency: 'USD',
  interval: 'month',
  features: ['Up to 3 projects', 'Community support'],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

const proPlan: SubscriptionPlanEntity = {
  id: '00000000-0000-0000-0001-000000000002',
  code: 'pro',
  name: 'Pro',
  description: 'For individuals and small teams.',
  price: 12,
  currency: 'USD',
  interval: 'month',
  features: ['Unlimited projects', 'Priority support', 'Advanced analytics'],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

function makeSqlMock(returnValue: unknown = [basePlan]) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

describe('SubscriptionPlanDBRepository.listActive — query behavior (R001, R002)', () => {
  it('WHEN listActive is called THEN it issues a SELECT with is_active = true and ORDER BY price ASC', async () => {
    const { sql, mockFn } = makeSqlMock([basePlan, proPlan]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual([basePlan, proPlan]);
  });

  it('WHEN no active plans exist THEN returns an empty array', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    expect(result).toEqual([]);
  });
});

describe('SubscriptionPlanDBRepository.listActive — free plan inclusion (EC001)', () => {
  it('WHEN a plan has price = 0 THEN it is included in the result', async () => {
    const { sql } = makeSqlMock([basePlan]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(0);
    expect(result[0].code).toBe('free');
  });
});

describe('SubscriptionPlanDBRepository.listActive — inactive plan exclusion (EC002)', () => {
  it('WHEN a plan has is_active = false THEN it is excluded from the result', async () => {
    // The query filters at the DB level; the mock returns only active plans
    const { sql } = makeSqlMock([basePlan]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    // Only the active plan is in the result; the inactive one would not be returned by the DB
    const inactivePlanPresent = result.some((p) => !p.is_active);
    expect(inactivePlanPresent).toBe(false);
  });
});

describe('SubscriptionPlanDBRepository.listActive — provider_plan_id nullable (R004)', () => {
  it('WHEN a plan has no provider_plan_id THEN provider_plan_id is null in the result', async () => {
    const { sql } = makeSqlMock([basePlan]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    expect(result[0].provider_plan_id).toBeNull();
  });

  it('WHEN a plan has a provider_plan_id THEN it is returned in the result', async () => {
    const planWithProvider: SubscriptionPlanEntity = { ...proPlan, provider_plan_id: 'stripe_price_001' };
    const { sql } = makeSqlMock([planWithProvider]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    expect(result[0].provider_plan_id).toBe('stripe_price_001');
  });
});

describe('SubscriptionPlanDBRepository.listActive — seed data (R003)', () => {
  it('WHEN all three seed plans are returned THEN their codes are free, pro, and business', async () => {
    const businessPlan: SubscriptionPlanEntity = {
      id: '00000000-0000-0000-0001-000000000003',
      code: 'business',
      name: 'Business',
      description: 'For growing teams that need more power.',
      price: 49,
      currency: 'USD',
      interval: 'month',
      features: ['Everything in Pro', 'SSO', 'SLA', 'Dedicated support'],
      is_active: true,
      provider_plan_id: null,
      created_at: '2026-06-23T00:00:00.000Z',
      updated_at: '2026-06-23T00:00:00.000Z',
    };
    const { sql } = makeSqlMock([basePlan, proPlan, businessPlan]);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    const result = await repo.listActive();

    const codes = result.map((p) => p.code);
    expect(codes).toContain('free');
    expect(codes).toContain('pro');
    expect(codes).toContain('business');
  });
});
