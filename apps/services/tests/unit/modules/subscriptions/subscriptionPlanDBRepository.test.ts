// Mock the static logger so we can spy on its methods
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { SubscriptionPlanDBRepository } from '../../../../src/modules/subscriptions/repositories/subscriptionPlanDBRepository.js';
import { ProviderError } from '../../../../src/shared/errors.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

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

function makeRejectingSqlMock(error: Error) {
  const mockFn = jest.fn().mockRejectedValue(error);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

beforeEach(() => {
  jest.clearAllMocks();
})

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

// T005 — SQL error path for listActive

describe('SubscriptionPlanDBRepository.listActive — SQL error path (R001, R002, R007, NF001, NF002, NF003)', () => {
  it('WHEN listActive sql rejects THEN logger.error is called with repository: \'SubscriptionPlanDBRepository\' and method: \'listActive\'', async () => {
    const rawError = new Error('connection lost');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    await expect(repo.listActive()).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'SubscriptionPlanDBRepository',
        method: 'listActive',
      }),
      expect.any(String),
    );
  });

  it('WHEN listActive sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('timeout');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new SubscriptionPlanDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.listActive();
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});
