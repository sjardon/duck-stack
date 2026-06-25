// Mock logger before any imports so spies are wired before the module loads
jest.mock('../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CheckoutUseCase } from '../../../src/modules/billing/useCases/checkoutUseCase.js';
import { ProviderError } from '../../../src/shared/errors.js';
import { logger } from '../../../src/shared/infrastructure/logger.js';
import type { ITransactionRepository } from '../../../src/modules/billing/repositories/interfaces/iTransactionRepository.js';
import type { TransactionEntity } from '../../../src/modules/billing/entities/transactionEntity.js';
import type { CheckoutBodyType } from '../../../src/modules/billing/dtos/checkoutDto.js';

// Prevent module-level DB connection from firing
jest.mock('../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

// Mock resolveProvider so tests don't need real provider credentials
const mockCreateCheckout = jest.fn();
jest.mock('../../../src/modules/billing/providers/resolveProvider.js', () => ({
  resolveProvider: () => ({
    createCheckout: mockCreateCheckout,
  }),
}));

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

const pendingEntity: TransactionEntity = {
  id: 'uuid-001',
  user_id: 'user-001',
  org_id: null,
  provider: 'mobbex',
  provider_transaction_id: null,
  amount: 1000,
  currency: 'ARS',
  status: 'pending',
  description: 'Test checkout',
  reference: 'uuid-001',
  idempotency_key: null,
  metadata: null,
  failure_reason: null,
  checkout_url: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

const validBody: CheckoutBodyType = {
  amount: 1000,
  currency: 'ARS',
  description: 'Test checkout',
};

function makeRepo(overrides: Partial<ITransactionRepository> = {}): ITransactionRepository {
  return {
    create: jest.fn().mockResolvedValue(pendingEntity),
    findById: jest.fn().mockResolvedValue(null),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    updateFailureReason: jest.fn().mockResolvedValue(undefined),
    updateProviderData: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ rows: [], nextCursor: null }),
    getRefundsByTransactionId: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateCheckout.mockResolvedValue({
    sessionId: 'session-001',
    checkoutUrl: 'https://mobbex.com/pay/session-001',
    expiresAt: new Date(),
  });
});

describe('CheckoutUseCase — idempotency key matches existing transaction (R012, EC001)', () => {
  it('WHEN idempotency key matches existing transaction THEN returns existing { checkoutUrl, transactionId } without calling provider', async () => {
    const existingEntity: TransactionEntity = {
      ...pendingEntity,
      checkout_url: 'https://mobbex.com/pay/existing',
    };
    const repo = makeRepo({
      findByIdempotencyKey: jest.fn().mockResolvedValue(existingEntity),
    });
    const useCase = new CheckoutUseCase(repo);

    const result = await useCase.execute('user-001', null, validBody, 'idem-key-001');

    expect(repo.findByIdempotencyKey).toHaveBeenCalledWith('idem-key-001', 'user-001', null);
    expect(repo.create).not.toHaveBeenCalled();
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    expect(result.transactionId).toBe(existingEntity.id);
    expect(result.checkoutUrl).toBe(existingEntity.checkout_url);
  });
});

describe('CheckoutUseCase — no idempotency key, inserts pending row then calls provider (R002, R003, R011, NF004)', () => {
  it('WHEN no idempotency key THEN inserts pending row with reference = id then calls provider', async () => {
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await useCase.execute('user-001', null, validBody);

    expect(repo.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledTimes(1);
    const createCall = (repo.create as jest.Mock).mock.calls[0][0] as { id: string; reference: string };
    // reference must equal the generated id (R011)
    expect(createCall.reference).toBe(createCall.id);
    expect(mockCreateCheckout).toHaveBeenCalledTimes(1);
  });
});

describe('CheckoutUseCase — provider success (R004)', () => {
  it('WHEN provider succeeds THEN calls updateProviderData and returns { checkoutUrl, transactionId }', async () => {
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    const result = await useCase.execute('user-001', null, validBody);

    expect(repo.updateProviderData).toHaveBeenCalledTimes(1);
    expect(result.checkoutUrl).toBe('https://mobbex.com/pay/session-001');
    expect(result.transactionId).toBe(pendingEntity.id);
  });
});

describe('CheckoutUseCase — provider failure (R005, EC004)', () => {
  it('WHEN provider throws ProviderError THEN calls updateFailureReason and re-throws', async () => {
    const providerErr = new ProviderError('Upstream failure', 502);
    mockCreateCheckout.mockRejectedValue(providerErr);
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await expect(useCase.execute('user-001', null, validBody)).rejects.toThrow(ProviderError);
    expect(repo.updateFailureReason).toHaveBeenCalledWith(pendingEntity.id, providerErr.message);
    // Row stays in pending status (no status update called)
    expect(repo.updateProviderData).not.toHaveBeenCalled();
  });
});

// T009 — R007, R008, R009: logger is called before re-throw

describe('CheckoutUseCase — logging before re-throw on provider failure (R007, R008, R009)', () => {
  it('WHEN provider throws ProviderError with statusCode 502 THEN logger.error is called before re-throw', async () => {
    const providerErr = new ProviderError('Upstream failure', 502);
    mockCreateCheckout.mockRejectedValue(providerErr);
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await expect(useCase.execute('user-001', null, validBody)).rejects.toThrow(ProviderError);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(providerErr);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('WHEN provider throws ProviderError with statusCode 400 THEN logger.warn is called before re-throw', async () => {
    const providerErr = new ProviderError('Bad request to provider', 400);
    mockCreateCheckout.mockRejectedValue(providerErr);
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await expect(useCase.execute('user-001', null, validBody)).rejects.toThrow(ProviderError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(providerErr);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('WHEN provider throws a generic Error (non-DomainError) THEN logger.error is called before re-throw', async () => {
    const genericErr = new Error('Unknown failure');
    mockCreateCheckout.mockRejectedValue(genericErr);
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await expect(useCase.execute('user-001', null, validBody)).rejects.toThrow(Error);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(genericErr);
  });
});

describe('CheckoutUseCase — org association (R013, EC003)', () => {
  it('WHEN orgId is non-null THEN org_id is set on the created row', async () => {
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await useCase.execute('user-001', 'org-001', validBody);

    const createCall = (repo.create as jest.Mock).mock.calls[0][0] as { org_id: string | null };
    expect(createCall.org_id).toBe('org-001');
  });

  it('WHEN orgId is null (EC003) THEN org_id is null and user_id is set', async () => {
    const repo = makeRepo();
    const useCase = new CheckoutUseCase(repo);

    await useCase.execute('user-001', null, validBody);

    const createCall = (repo.create as jest.Mock).mock.calls[0][0] as {
      org_id: string | null;
      user_id: string;
    };
    expect(createCall.org_id).toBeNull();
    expect(createCall.user_id).toBe('user-001');
  });
});
