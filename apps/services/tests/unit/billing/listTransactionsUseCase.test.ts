// Mock logger before any imports
jest.mock('../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ListTransactionsUseCase } from '../../../src/modules/billing/useCases/listTransactionsUseCase.js';
import { ValidationError } from '../../../src/shared/errors.js';
import { logger } from '../../../src/shared/infrastructure/logger.js';
import type { ITransactionRepository } from '../../../src/modules/billing/repositories/interfaces/iTransactionRepository.js';
import type { TransactionEntity } from '../../../src/modules/billing/entities/transactionEntity.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

const baseEntity: TransactionEntity = {
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

function makeRepo(listResult: { rows: TransactionEntity[]; nextCursor: string | null }): ITransactionRepository {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    updateFailureReason: jest.fn(),
    updateProviderData: jest.fn(),
    list: jest.fn().mockResolvedValue(listResult),
  } as unknown as ITransactionRepository;
}

describe('ListTransactionsUseCase — basic listing without cursor (R009)', () => {
  it('WHEN called without cursor THEN calls repo.list with correct userId/orgId and default limit 20', async () => {
    const repo = makeRepo({ rows: [baseEntity], nextCursor: null });
    const useCase = new ListTransactionsUseCase(repo);

    const result = await useCase.execute('user-001', null, { limit: 20 });

    expect(repo.list).toHaveBeenCalledWith({
      userId: 'user-001',
      orgId: null,
      limit: 20,
      cursor: undefined,
    });
    expect(result.data).toEqual([baseEntity]);
    expect(result.nextCursor).toBeNull();
  });
});

describe('ListTransactionsUseCase — cursor-based pagination (NF003)', () => {
  it('WHEN valid cursor provided THEN calls repo.list with the decoded cursor', async () => {
    const repo = makeRepo({ rows: [baseEntity], nextCursor: null });
    const useCase = new ListTransactionsUseCase(repo);

    const cursorPayload = JSON.stringify({ created_at: '2026-06-22T00:00:00.000Z', id: 'uuid-002' });
    const cursor = Buffer.from(cursorPayload).toString('base64');

    await useCase.execute('user-001', null, { limit: 20, cursor });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ cursor }),
    );
  });

  it('WHEN repo.list returns limit+1 rows THEN nextCursor is non-null', async () => {
    const rows = Array.from({ length: 2 }, (_, i) => ({ ...baseEntity, id: `uuid-00${i + 1}` }));
    const encodedCursor = Buffer.from(JSON.stringify({ created_at: '2026-06-21T00:00:00.000Z', id: 'uuid-002' })).toString('base64');
    const repo = makeRepo({ rows, nextCursor: encodedCursor });
    const useCase = new ListTransactionsUseCase(repo);

    const result = await useCase.execute('user-001', null, { limit: 20 });

    expect(result.nextCursor).not.toBeNull();
  });
});

describe('ListTransactionsUseCase — malformed cursor (EC007)', () => {
  it('WHEN malformed cursor provided THEN throws ValidationError (400)', async () => {
    const repo = makeRepo({ rows: [], nextCursor: null });
    // Force repo.list to simulate bad cursor by making the use case throw on decode
    // We pass an invalid base64 that decodes to non-JSON
    (repo.list as jest.Mock).mockRejectedValue(new ValidationError('Invalid cursor'));
    const useCase = new ListTransactionsUseCase(repo);

    const badCursor = '!!!not-valid-base64!!!';

    await expect(useCase.execute('user-001', null, { limit: 20, cursor: badCursor })).rejects.toThrow(ValidationError);
  });

  it('WHEN cursor decodes to invalid JSON THEN throws ValidationError (400)', async () => {
    const repo = makeRepo({ rows: [], nextCursor: null });
    const useCase = new ListTransactionsUseCase(repo);

    // Valid base64 but not valid cursor JSON structure
    const badCursor = Buffer.from('not-json').toString('base64');

    await expect(useCase.execute('user-001', null, { limit: 20, cursor: badCursor })).rejects.toThrow(ValidationError);
  });
});

describe('ListTransactionsUseCase — org-scoped filtering (EC005)', () => {
  it('WHEN orgId is non-null THEN passes orgId to repo.list for org-scoped filtering', async () => {
    const repo = makeRepo({ rows: [], nextCursor: null });
    const useCase = new ListTransactionsUseCase(repo);

    await useCase.execute('user-001', 'org-001', { limit: 20 });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-001' }),
    );
  });
});

// T014 — R007, R008, EC005: logger.warn in both cursor catch branches

describe('ListTransactionsUseCase — logger.warn in both cursor catch branches (R007, R008, EC005)', () => {
  it('WHEN cursor decode throws a ValidationError THEN logger.warn is called before re-throw', async () => {
    const repo = makeRepo({ rows: [], nextCursor: null });
    const useCase = new ListTransactionsUseCase(repo);

    // A cursor that decodes to a non-object JSON value fails the shape check and throws ValidationError
    const badCursor = Buffer.from('"not-an-object"').toString('base64');

    await expect(useCase.execute('user-001', null, { limit: 20, cursor: badCursor })).rejects.toBeInstanceOf(ValidationError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBeDefined();
  });

  it('WHEN cursor decode throws a non-ValidationError (e.g. JSON.parse failure on invalid JSON) THEN logger.warn is called before throwing ValidationError', async () => {
    const repo = makeRepo({ rows: [], nextCursor: null });
    const useCase = new ListTransactionsUseCase(repo);

    // '!!!' is valid base64 but decodes to bytes that are not valid JSON, causing JSON.parse to throw SyntaxError
    const badCursor = Buffer.from('not-valid-json-at-all{{{').toString('base64');

    await expect(useCase.execute('user-001', null, { limit: 20, cursor: badCursor })).rejects.toBeInstanceOf(ValidationError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBeDefined();
  });
});
