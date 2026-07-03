jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { UsageCounterDBRepository } from '../../../../../src/modules/subscriptions/repositories/usageCounterDBRepository.js';
import { ProviderError } from '../../../../../src/shared/errors.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
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
});

// T007 — R002, R003, NF001
describe('UsageCounterDBRepository.incrementAndReturn — atomic upsert (R002, R003, NF001)', () => {
  it('WHEN called on a new row THEN returns 1', async () => {
    const { sql } = makeSqlMock([{ count: 1 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.incrementAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z');

    expect(result).toBe(1);
  });

  it('WHEN called on an existing row THEN returns previous count + 1', async () => {
    const { sql } = makeSqlMock([{ count: 42 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.incrementAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z');

    expect(result).toBe(42);
  });

  it('WHEN called THEN issues a single SQL call (atomic upsert)', async () => {
    const { sql, mockFn } = makeSqlMock([{ count: 1 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    await repo.incrementAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z');

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('WHEN called with orgId THEN passes org_id to the SQL', async () => {
    const { sql, mockFn } = makeSqlMock([{ count: 5 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.incrementAndReturn(null, 'org-001', 'api_requests', '2026-06-01T00:00:00.000Z');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toBe(5);
  });

  it('WHEN sql rejects THEN logger.error is called and ProviderError is thrown', async () => {
    const rawError = new Error('db error');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UsageCounterDBRepository(sql as never);

    await expect(repo.incrementAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z')).rejects.toBeInstanceOf(ProviderError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UsageCounterDBRepository',
        method: 'incrementAndReturn',
      }),
      expect.any(String),
    );
  });
});

describe('UsageCounterDBRepository.findCount — current count retrieval (R002)', () => {
  it('WHEN a row exists THEN returns the count', async () => {
    const { sql } = makeSqlMock([{ count: 77 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.findCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z');

    expect(result).toBe(77);
  });

  it('WHEN no row exists THEN returns 0', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.findCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z');

    expect(result).toBe(0);
  });

  it('WHEN sql rejects THEN logger.error is called and ProviderError is thrown', async () => {
    const rawError = new Error('db error');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UsageCounterDBRepository(sql as never);

    await expect(repo.findCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z')).rejects.toBeInstanceOf(ProviderError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UsageCounterDBRepository',
        method: 'findCount',
      }),
      expect.any(String),
    );
  });
});

// T004 — R003, R005, NF001, NF002, NF003
describe('UsageCounterDBRepository.incrementByAndReturn — atomic upsert with cost (R003, NF002)', () => {
  it('WHEN called with cost 5 THEN the SQL upsert adds 5 to count and returns the new value', async () => {
    const { sql } = makeSqlMock([{ count: 5 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.incrementByAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 5);

    expect(result).toBe(5);
  });

  it('WHEN called on an existing row with cost 3 THEN returns previous count + 3', async () => {
    const { sql } = makeSqlMock([{ count: 45 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.incrementByAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 3);

    expect(result).toBe(45);
  });

  it('WHEN called THEN issues exactly one SQL call (atomic upsert — NF002)', async () => {
    const { sql, mockFn } = makeSqlMock([{ count: 5 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    await repo.incrementByAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 5);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('WHEN sql rejects THEN logger.error is called and ProviderError is thrown', async () => {
    const rawError = new Error('db error');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UsageCounterDBRepository(sql as never);

    await expect(
      repo.incrementByAndReturn('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 5),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UsageCounterDBRepository',
        method: 'incrementByAndReturn',
      }),
      expect.any(String),
    );
  });
});

describe('UsageCounterDBRepository.adjustCount — atomic UPDATE with delta (R005, NF001, NF003)', () => {
  it('WHEN called with delta -3 THEN issues a single SQL UPDATE (no prior SELECT — NF001)', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new UsageCounterDBRepository(sql as never);

    await repo.adjustCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', -3);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('WHEN called with positive delta THEN issues a single SQL UPDATE', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new UsageCounterDBRepository(sql as never);

    await repo.adjustCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 10);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('WHEN delta is 0 THEN no SQL query is issued', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new UsageCounterDBRepository(sql as never);

    await repo.adjustCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 0);

    expect(mockFn).not.toHaveBeenCalled();
  });

  it('WHEN sql rejects THEN logger.error is called and ProviderError is thrown', async () => {
    const rawError = new Error('db error');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UsageCounterDBRepository(sql as never);

    await expect(
      repo.adjustCount('user-001', null, 'api_requests', '2026-06-01T00:00:00.000Z', 5),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UsageCounterDBRepository',
        method: 'adjustCount',
      }),
      expect.any(String),
    );
  });
});

// T031 — R011 natural period rollover
describe('UsageCounterDBRepository.incrementAndReturn — natural period rollover (R011)', () => {
  it('WHEN called with a different periodStart THEN inserts a new row (count = 1)', async () => {
    // Simulate that the second call (new period) starts fresh: SQL returns count = 1
    const { sql, mockFn } = makeSqlMock([{ count: 1 }]);
    const repo = new UsageCounterDBRepository(sql as never);

    const result = await repo.incrementAndReturn('user-001', null, 'api_requests', '2026-07-01T00:00:00.000Z');

    // The upsert uses period_start as part of the unique key;
    // a different period_start does not match the existing row, so Postgres inserts
    // a new row and returns count = 1.
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toBe(1);
  });
});
