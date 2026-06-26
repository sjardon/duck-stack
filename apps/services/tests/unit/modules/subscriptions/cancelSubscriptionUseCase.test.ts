// Mock logger before any imports
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CancelSubscriptionUseCase } from '../../../../src/modules/subscriptions/useCases/cancelSubscriptionUseCase.js';
import { NotFoundError, ProviderError } from '../../../../src/shared/errors.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';
import type { ISubscriptionRepository } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';
import type { PaymentProvider } from '@repo/types';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

const activeSubscription: SubscriptionEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-pro-001',
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

const pendingSubscription: SubscriptionEntity = {
  ...activeSubscription,
  status: 'pending',
};

function makeRepo(overrides: Partial<ISubscriptionRepository> = {}): ISubscriptionRepository {
  return {
    findActiveByScopeStatus: jest.fn().mockResolvedValue(null),
    findByIdAndScope: jest.fn().mockResolvedValue(activeSubscription),
    findPlanByCode: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    setCancelAtPeriodEnd: jest.fn().mockResolvedValue({ ...activeSubscription, cancel_at_period_end: true }),
    cancelImmediately: jest.fn().mockResolvedValue({ ...activeSubscription, status: 'canceled', canceled_at: '2026-06-24T12:00:00.000Z' }),
    findActiveOrWithinPeriodByScope: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    createCheckout: jest.fn(),
    queryTransaction: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    verifyWebhook: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CancelSubscriptionUseCase — subscription not found (R008)', () => {
  it('WHEN subscription not found or belongs to different scope THEN throws NotFoundError 404', async () => {
    const repo = makeRepo({ findByIdAndScope: jest.fn().mockResolvedValue(null) });
    const provider = makeProvider();
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    await expect(useCase.execute('user-001', null, 'sub-999', { atPeriodEnd: true })).rejects.toThrow(NotFoundError);

    expect(repo.setCancelAtPeriodEnd).not.toHaveBeenCalled();
    expect(provider.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('CancelSubscriptionUseCase — atPeriodEnd = true (R009)', () => {
  it('WHEN atPeriodEnd = true THEN sets cancel_at_period_end = true and calls provider', async () => {
    const repo = makeRepo();
    const provider = makeProvider();
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    const result = await useCase.execute('user-001', null, 'sub-001', { atPeriodEnd: true });

    expect(repo.setCancelAtPeriodEnd).toHaveBeenCalledWith('sub-001');
    expect(repo.cancelImmediately).not.toHaveBeenCalled();
    expect(provider.cancelSubscription).toHaveBeenCalledWith('prov-sub-001');
    expect(result.cancel_at_period_end).toBe(true);
  });
});

describe('CancelSubscriptionUseCase — atPeriodEnd = false (R010)', () => {
  it('WHEN atPeriodEnd = false THEN sets status = canceled and calls provider immediately', async () => {
    const repo = makeRepo();
    const provider = makeProvider();
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    const result = await useCase.execute('user-001', null, 'sub-001', { atPeriodEnd: false });

    expect(repo.cancelImmediately).toHaveBeenCalledWith('sub-001');
    expect(repo.setCancelAtPeriodEnd).not.toHaveBeenCalled();
    expect(provider.cancelSubscription).toHaveBeenCalledWith('prov-sub-001');
    expect(result.status).toBe('canceled');
  });
});

describe('CancelSubscriptionUseCase — provider 404 treated as success (EC001)', () => {
  it('WHEN subscription is pending and provider responds with 404-mapped ProviderError THEN treats as success', async () => {
    const repo = makeRepo({
      findByIdAndScope: jest.fn().mockResolvedValue(pendingSubscription),
      setCancelAtPeriodEnd: jest.fn().mockResolvedValue({ ...pendingSubscription, cancel_at_period_end: true }),
    });
    const provider = makeProvider({
      cancelSubscription: jest.fn().mockRejectedValue(new ProviderError('subscription not found', 400)),
    });
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    await expect(useCase.execute('user-001', null, 'sub-001', { atPeriodEnd: true })).resolves.toBeDefined();
  });

  it('WHEN provider throws a non-404 ProviderError THEN re-throws', async () => {
    const repo = makeRepo();
    const provider = makeProvider({
      cancelSubscription: jest.fn().mockRejectedValue(new ProviderError('upstream failure', 502)),
    });
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    await expect(useCase.execute('user-001', null, 'sub-001', { atPeriodEnd: true })).rejects.toThrow(ProviderError);
  });
});

// T011 — R007, R008, R010, EC003: logger.warn on ProviderError 400 and returns local result

describe('CancelSubscriptionUseCase — logger.warn on ProviderError 400 silent-fail (R007, R008, R010, EC003)', () => {
  it('WHEN provider throws ProviderError with statusCode 400 THEN logger.warn is called and use case returns locally-cancelled subscription', async () => {
    const providerErr = new ProviderError('subscription not found', 400);
    const cancelledLocally = { ...activeSubscription, status: 'canceled' as const, canceled_at: '2026-06-24T12:00:00.000Z' };
    const repo = makeRepo({
      cancelImmediately: jest.fn().mockResolvedValue(cancelledLocally),
    });
    const provider = makeProvider({
      cancelSubscription: jest.fn().mockRejectedValue(providerErr),
    });
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    const result = await useCase.execute('user-001', null, 'sub-001', { atPeriodEnd: false });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(providerErr);
    expect(result).toEqual(cancelledLocally);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

// T012 — R007, R009: logger.error before re-throw on non-400 failure

describe('CancelSubscriptionUseCase — logger.error before re-throw on non-400 failure (R007, R009)', () => {
  it('WHEN provider throws ProviderError with statusCode 502 THEN logger.error is called before re-throw', async () => {
    const providerErr = new ProviderError('upstream failure', 502);
    const repo = makeRepo();
    const provider = makeProvider({
      cancelSubscription: jest.fn().mockRejectedValue(providerErr),
    });
    const useCase = new CancelSubscriptionUseCase(repo, provider);

    await expect(useCase.execute('user-001', null, 'sub-001', { atPeriodEnd: true })).rejects.toThrow(ProviderError);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(providerErr);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
