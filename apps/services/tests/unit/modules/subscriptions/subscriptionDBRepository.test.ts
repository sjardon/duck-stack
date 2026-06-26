// Mock the static logger so we can spy on its methods
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { SubscriptionDBRepository } from '../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js';
import { ProviderError } from '../../../../src/shared/errors.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';
import type { SubscriptionWithPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionWithPlanEntity.js';
import type { CreateSubscriptionData } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

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

// T010 — findActiveOrWithinPeriodByScope tests (R002)

const baseSubscriptionWithPlan: SubscriptionWithPlanEntity = {
  ...baseSubscription,
  plan_code: 'pro',
};

describe('SubscriptionDBRepository.findActiveOrWithinPeriodByScope — active and within-period lookup (R002)', () => {
  it('WHEN a non-terminal subscription exists THEN it is returned with plan_code', async () => {
    const { sql } = makeSqlMock([baseSubscriptionWithPlan]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveOrWithinPeriodByScope('user-001', null);

    expect(result).toEqual(baseSubscriptionWithPlan);
    expect(result?.plan_code).toBe('pro');
  });

  it('WHEN a canceled-but-within-period subscription exists THEN it is returned', async () => {
    const canceledWithinPeriod: SubscriptionWithPlanEntity = {
      ...baseSubscriptionWithPlan,
      status: 'canceled',
      canceled_at: '2026-06-20T00:00:00.000Z',
      current_period_end: '2026-07-24T00:00:00.000Z',
    };
    const { sql } = makeSqlMock([canceledWithinPeriod]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveOrWithinPeriodByScope('user-001', null);

    expect(result).toEqual(canceledWithinPeriod);
  });

  it('WHEN only expired or past-period subscriptions exist THEN returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveOrWithinPeriodByScope('user-001', null);

    expect(result).toBeNull();
  });

  it('WHEN called for an org scope THEN queries by org_id', async () => {
    const orgSub: SubscriptionWithPlanEntity = {
      ...baseSubscriptionWithPlan,
      user_id: 'user-001',
      org_id: 'org-001',
    };
    const { sql, mockFn } = makeSqlMock([orgSub]);
    const repo = new SubscriptionDBRepository(sql as never);

    const result = await repo.findActiveOrWithinPeriodByScope('user-001', 'org-001');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(orgSub);
  });
});

// T003 — SQL error path tests

describe('SubscriptionDBRepository — SQL error paths (R001, R002, R007, NF001, NF002, NF003)', () => {
  const methods: Array<{ name: string; call: (repo: SubscriptionDBRepository) => Promise<unknown> }> = [
    {
      name: 'findActiveByScopeStatus',
      call: (repo) => repo.findActiveByScopeStatus('user-001', null),
    },
    {
      name: 'findByIdAndScope',
      call: (repo) => repo.findByIdAndScope('sub-001', 'user-001', null),
    },
    {
      name: 'findPlanByCode',
      call: (repo) => repo.findPlanByCode('pro'),
    },
    {
      name: 'create',
      call: (repo) =>
        repo.create({
          id: 'sub-001',
          user_id: 'user-001',
          org_id: null,
          plan_id: 'plan-001',
          provider: 'mobbex',
          provider_subscription_id: 'prov-001',
          status: 'active',
          current_period_start: null,
          current_period_end: null,
        }),
    },
    {
      name: 'setCancelAtPeriodEnd',
      call: (repo) => repo.setCancelAtPeriodEnd('sub-001'),
    },
    {
      name: 'cancelImmediately',
      call: (repo) => repo.cancelImmediately('sub-001'),
    },
    {
      name: 'findActiveOrWithinPeriodByScope',
      call: (repo) => repo.findActiveOrWithinPeriodByScope('user-001', null),
    },
  ];

  for (const { name, call } of methods) {
    it(`WHEN ${name} sql rejects THEN logger.error is called with repository: 'SubscriptionDBRepository' and method: '${name}'`, async () => {
      const rawError = new Error(`db error in ${name}`);
      const { sql } = makeRejectingSqlMock(rawError);
      const repo = new SubscriptionDBRepository(sql as never);

      await expect(call(repo)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: 'SubscriptionDBRepository',
          method: name,
        }),
        expect.any(String),
      );
    });

    it(`WHEN ${name} sql rejects THEN re-throws ProviderError with statusCode 502 and originalError`, async () => {
      const rawError = new Error(`timeout in ${name}`);
      const { sql } = makeRejectingSqlMock(rawError);
      const repo = new SubscriptionDBRepository(sql as never);

      let thrown: unknown;
      try {
        await call(repo);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(ProviderError);
      expect((thrown as ProviderError).statusCode).toBe(502);
      expect((thrown as ProviderError).originalError).toBe(rawError);
    });
  }
});
