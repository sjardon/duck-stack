jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock entitlements so we can control strategy mode
const mockResolveStrategy = jest.fn();
jest.mock('../../../../../src/modules/subscriptions/entitlements.js', () => ({
  resolveStrategy: (...args: unknown[]) => mockResolveStrategy(...args),
}));

import type { IUsageCounterRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iUsageCounterRepository.js';
import { ChargeQuotaUseCase } from '../../../../../src/modules/subscriptions/useCases/chargeQuotaUseCase.js';
import { ValidationError, ProgrammingError } from '../../../../../src/shared/errors.js';

const rowKey = { userId: 'user-001', orgId: null, periodStart: '2026-06-01T00:00:00.000Z' };

function makeCounterRepo(): IUsageCounterRepository {
  return {
    incrementAndReturn: jest.fn(),
    incrementByAndReturn: jest.fn(),
    adjustCount: jest.fn().mockResolvedValue(undefined),
    findCount: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: strategy mode is 'post'
  mockResolveStrategy.mockReturnValue({ unit: 'token', mode: 'post', compute: () => 5 });
});

// T014 — R005, R006, R007, R009, EC004, EC006
describe('ChargeQuotaUseCase — validation (EC004, EC006)', () => {
  it('WHEN actual < 0 THEN ValidationError is thrown and adjustCount is not called (EC004)', async () => {
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    await expect(useCase.execute(reservation, 'api_requests', -1)).rejects.toBeInstanceOf(ValidationError);
    expect(counterRepo.adjustCount).not.toHaveBeenCalled();
  });

  it('WHEN strategy mode is pre THEN ProgrammingError is thrown (EC006)', async () => {
    mockResolveStrategy.mockReturnValue({ unit: 'request', mode: 'pre', compute: () => 1 });
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    await expect(useCase.execute(reservation, 'api_requests', 5)).rejects.toBeInstanceOf(ProgrammingError);
    expect(counterRepo.adjustCount).not.toHaveBeenCalled();
  });
});

describe('ChargeQuotaUseCase — delta computation (R005)', () => {
  it('WHEN actual > charged THEN adjustCount is called with positive delta', async () => {
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    const result = await useCase.execute(reservation, 'api_requests', 15);

    expect(counterRepo.adjustCount).toHaveBeenCalledWith(
      rowKey.userId, rowKey.orgId, 'api_requests', rowKey.periodStart, 5,
    );
    expect(result).toBe(15);
  });

  it('WHEN actual < charged THEN adjustCount is called with negative delta', async () => {
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    const result = await useCase.execute(reservation, 'api_requests', 3);

    expect(counterRepo.adjustCount).toHaveBeenCalledWith(
      rowKey.userId, rowKey.orgId, 'api_requests', rowKey.periodStart, -7,
    );
    expect(result).toBe(3);
  });

  it('WHEN actual equals charged THEN adjustCount is not called (NF001 — no-op)', async () => {
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    await useCase.execute(reservation, 'api_requests', 10);

    expect(counterRepo.adjustCount).not.toHaveBeenCalled();
  });

  it('WHEN actual is 0 THEN adjustCount is called with negative delta equal to charged', async () => {
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    await useCase.execute(reservation, 'api_requests', 0);

    expect(counterRepo.adjustCount).toHaveBeenCalledWith(
      rowKey.userId, rowKey.orgId, 'api_requests', rowKey.periodStart, -10,
    );
  });
});

describe('ChargeQuotaUseCase — incremental charging (R007)', () => {
  it('WHEN called twice with increasing actuals THEN delta is computed relative to the most recent charged', async () => {
    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    // First call: actual=15, delta=5
    const firstCharged = await useCase.execute(reservation, 'api_requests', 15);
    expect(firstCharged).toBe(15);
    expect(counterRepo.adjustCount).toHaveBeenNthCalledWith(1,
      rowKey.userId, rowKey.orgId, 'api_requests', rowKey.periodStart, 5,
    );

    // Simulate the helper updating reservation.charged after first call
    reservation.charged = firstCharged;

    // Second call: actual=20, delta=5 (not 10)
    const secondCharged = await useCase.execute(reservation, 'api_requests', 20);
    expect(secondCharged).toBe(20);
    expect(counterRepo.adjustCount).toHaveBeenNthCalledWith(2,
      rowKey.userId, rowKey.orgId, 'api_requests', rowKey.periodStart, 5,
    );
  });
});

describe('ChargeQuotaUseCase — R009 warning on positive delta', () => {
  it('WHEN delta > 0 THEN logs a warning about potential hard limit overflow (R009)', async () => {
    const { logger } = await import('../../../../../src/shared/infrastructure/logger.js');
    const mockWarn = logger.warn as jest.Mock;

    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    await useCase.execute(reservation, 'api_requests', 50);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ quotaName: 'api_requests', delta: 40 }),
      expect.any(String),
    );
  });

  it('WHEN delta <= 0 THEN no warning is logged', async () => {
    const { logger } = await import('../../../../../src/shared/infrastructure/logger.js');
    const mockWarn = logger.warn as jest.Mock;

    const counterRepo = makeCounterRepo();
    const useCase = new ChargeQuotaUseCase(counterRepo);
    const reservation = { reserved: 10, charged: 10, rowKey };

    await useCase.execute(reservation, 'api_requests', 5);

    expect(mockWarn).not.toHaveBeenCalled();
  });
});
