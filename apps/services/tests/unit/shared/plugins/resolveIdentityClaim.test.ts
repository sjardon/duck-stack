jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { resolveIdentityClaim } from '../../../../src/shared/plugins/resolveIdentityClaim.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';

const mockLogger = logger as unknown as { warn: jest.Mock };

function flushMicrotasksAndTimers(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T011(1) — R001, NF001, EC003: fast path
describe('resolveIdentityClaim — fast path (R001, NF001, EC003)', () => {
  it('WHEN claimValue is provided THEN it is returned immediately and lookupById/backfill are never called', async () => {
    const lookupById = jest.fn();
    const backfill = jest.fn();

    const result = await resolveIdentityClaim({
      claimValue: 'internal-user-001',
      clerkId: 'clerk_abc',
      lookupById,
      backfill,
    });

    expect(result).toBe('internal-user-001');
    expect(lookupById).not.toHaveBeenCalled();
    expect(backfill).not.toHaveBeenCalled();
  });
});

// T011(2) — R006, NF002, NF003: retry/backoff with growing delay
describe('resolveIdentityClaim — degraded path retry/backoff (R006, NF002, NF003)', () => {
  it('WHEN claimValue is absent and lookupById resolves after two failed attempts THEN it returns the resolved id with growing delay between attempts', async () => {
    const callTimestamps: number[] = [];
    const lookupById = jest
      .fn()
      .mockImplementationOnce(() => {
        callTimestamps.push(Date.now());
        return Promise.resolve(null);
      })
      .mockImplementationOnce(() => {
        callTimestamps.push(Date.now());
        return Promise.resolve(null);
      })
      .mockImplementationOnce(() => {
        callTimestamps.push(Date.now());
        return Promise.resolve('internal-user-001');
      });
    const backfill = jest.fn().mockResolvedValue(undefined);

    const result = await resolveIdentityClaim({
      claimValue: undefined,
      clerkId: 'clerk_abc',
      lookupById,
      backfill,
      budgetMs: 5000,
    });

    expect(result).toBe('internal-user-001');
    expect(lookupById).toHaveBeenCalledTimes(3);

    const firstGap = callTimestamps[1] - callTimestamps[0];
    const secondGap = callTimestamps[2] - callTimestamps[1];
    expect(secondGap).toBeGreaterThan(firstGap * 1.5);
  }, 10000);

  it('WHEN lookupById never resolves before the budget elapses THEN it returns null', async () => {
    const lookupById = jest.fn().mockResolvedValue(null);
    const backfill = jest.fn();

    const start = Date.now();
    const result = await resolveIdentityClaim({
      claimValue: undefined,
      clerkId: 'clerk_abc',
      lookupById,
      backfill,
      budgetMs: 350,
    });
    const elapsed = Date.now() - start;

    expect(result).toBeNull();
    expect(backfill).not.toHaveBeenCalled();
    expect(elapsed).toBeLessThan(1000);
  }, 10000);
});

// T011(4) — R008, EC002, NF004: fire-and-forget backfill
describe('resolveIdentityClaim — fire-and-forget backfill (R008, EC002, NF004)', () => {
  it('WHEN a degraded-path lookup succeeds THEN backfill is invoked and its result is not awaited by the caller', async () => {
    let backfillResolved = false;
    let resolveBackfill: () => void = () => {};
    const backfillPromise = new Promise<void>((resolve) => {
      resolveBackfill = () => {
        backfillResolved = true;
        resolve();
      };
    });
    const lookupById = jest.fn().mockResolvedValue('internal-user-001');
    const backfill = jest.fn().mockReturnValue(backfillPromise);

    const result = await resolveIdentityClaim({
      claimValue: undefined,
      clerkId: 'clerk_abc',
      lookupById,
      backfill,
      budgetMs: 2000,
    });

    expect(result).toBe('internal-user-001');
    expect(backfill).toHaveBeenCalledWith('clerk_abc', 'internal-user-001');
    // resolveIdentityClaim already returned even though backfill has not settled yet
    expect(backfillResolved).toBe(false);

    resolveBackfill();
    await backfillPromise;
  });

  it('WHEN backfill rejects THEN the rejection is caught and logged via logger.warn without throwing', async () => {
    const backfillError = new Error('clerk metadata write failed');
    const lookupById = jest.fn().mockResolvedValue('internal-user-001');
    const backfill = jest.fn().mockRejectedValue(backfillError);

    const result = await resolveIdentityClaim({
      claimValue: undefined,
      clerkId: 'clerk_abc',
      lookupById,
      backfill,
      budgetMs: 2000,
    });

    expect(result).toBe('internal-user-001');

    await flushMicrotasksAndTimers();
    await flushMicrotasksAndTimers();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: backfillError, clerkId: 'clerk_abc' }),
      expect.any(String),
    );
  });
});

// T011(5) — EC006: no shared state across concurrent invocations
describe('resolveIdentityClaim — independent concurrent invocations (EC006)', () => {
  it('WHEN two concurrent invocations run for the same clerkId THEN each runs its own retry loop independently', async () => {
    let callsA = 0;
    const lookupByIdA = jest.fn().mockImplementation(() => {
      callsA += 1;
      return Promise.resolve(callsA >= 2 ? 'internal-user-001' : null);
    });

    let callsB = 0;
    const lookupByIdB = jest.fn().mockImplementation(() => {
      callsB += 1;
      return Promise.resolve(callsB >= 3 ? 'internal-user-001' : null);
    });

    const backfillA = jest.fn().mockResolvedValue(undefined);
    const backfillB = jest.fn().mockResolvedValue(undefined);

    const [resultA, resultB] = await Promise.all([
      resolveIdentityClaim({
        claimValue: undefined,
        clerkId: 'clerk_abc',
        lookupById: lookupByIdA,
        backfill: backfillA,
        budgetMs: 5000,
      }),
      resolveIdentityClaim({
        claimValue: undefined,
        clerkId: 'clerk_abc',
        lookupById: lookupByIdB,
        backfill: backfillB,
        budgetMs: 5000,
      }),
    ]);

    expect(resultA).toBe('internal-user-001');
    expect(resultB).toBe('internal-user-001');
    expect(lookupByIdA).toHaveBeenCalledTimes(2);
    expect(lookupByIdB).toHaveBeenCalledTimes(3);
  }, 10000);
});
