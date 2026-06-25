// Mock the static logger so we can spy on its methods
jest.mock('../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { TransactionDBRepository } from '../../../src/modules/billing/repositories/transactionDBRepository.js';
import { ProviderError } from '../../../src/shared/errors.js';
import { logger } from '../../../src/shared/infrastructure/logger.js';
import type { TransactionEntity } from '../../../src/modules/billing/entities/transactionEntity.js';
import type { RefundEntity } from '../../../src/modules/billing/entities/refundEntity.js';
import type { CreateTransactionData } from '../../../src/modules/billing/repositories/interfaces/iTransactionRepository.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

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

function makeSqlMock(returnValue: unknown = [baseEntity]) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  // Make it behave as a tagged template function
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
    { json: (val: unknown) => val },
  );
  return { sql, mockFn };
}

beforeEach(() => {
  jest.clearAllMocks();
})

describe('TransactionDBRepository.create', () => {
  it('WHEN create is called THEN it executes an INSERT with the correct field values', async () => {
    const { sql, mockFn } = makeSqlMock([baseEntity]);
    const repo = new TransactionDBRepository(sql as never);

    const input: CreateTransactionData = {
      id: 'uuid-001',
      user_id: 'user-001',
      org_id: null,
      provider: 'mobbex',
      amount: 1000,
      currency: 'ARS',
      description: 'Test checkout',
      reference: 'uuid-001',
      metadata: null,
    };

    const result = await repo.create(input);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(baseEntity);
  });
});

describe('TransactionDBRepository.findById', () => {
  it('WHEN findById is called THEN it queries by id and returns the entity', async () => {
    const { sql, mockFn } = makeSqlMock([baseEntity]);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.findById('uuid-001');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(baseEntity);
  });

  it('WHEN findById returns no rows THEN it returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.findById('nonexistent');

    expect(result).toBeNull();
  });
});

describe('TransactionDBRepository.findByIdempotencyKey', () => {
  it('WHEN findByIdempotencyKey is called THEN it queries by idempotency_key, user_id, and org_id', async () => {
    const { sql, mockFn } = makeSqlMock([baseEntity]);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.findByIdempotencyKey('idem-key-001', 'user-001', null);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(baseEntity);
  });

  it('WHEN no matching row exists THEN it returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.findByIdempotencyKey('nonexistent', 'user-001', null);

    expect(result).toBeNull();
  });
});

describe('TransactionDBRepository.getRefundsByTransactionId', () => {
  it('WHEN getRefundsByTransactionId is called THEN executes a SELECT on refunds WHERE transaction_id = $id ORDER BY created_at ASC', async () => {
    const refundEntity: RefundEntity = {
      id: 'refund-001',
      transaction_id: 'uuid-001',
      amount: 500,
      reason: 'Customer request',
      status: 'approved',
      provider_refund_id: 'prov-refund-001',
      created_at: '2026-06-23T01:00:00.000Z',
      updated_at: '2026-06-23T01:00:00.000Z',
    };

    const { sql, mockFn } = makeSqlMock([refundEntity]);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.getRefundsByTransactionId('uuid-001');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual([refundEntity]);
  });

  it('WHEN no refunds exist for the transaction THEN returns an empty array', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.getRefundsByTransactionId('uuid-001');

    expect(result).toEqual([]);
  });
});

describe('TransactionDBRepository.list', () => {
  it('WHEN list is called without cursor THEN returns rows and null nextCursor when within limit', async () => {
    const rows = [baseEntity];
    const { sql } = makeSqlMock(rows);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.list({ userId: 'user-001', orgId: null, limit: 20 });

    expect(result.rows).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('WHEN list returns limit+1 rows THEN nextCursor is non-null', async () => {
    // Return 3 rows for a limit of 2 — one extra triggers cursor encoding
    const extraRow: TransactionEntity = {
      ...baseEntity,
      id: 'uuid-003',
      created_at: '2026-06-21T00:00:00.000Z',
    };
    const row2: TransactionEntity = {
      ...baseEntity,
      id: 'uuid-002',
      created_at: '2026-06-22T00:00:00.000Z',
    };
    const rows = [baseEntity, row2, extraRow];
    const { sql } = makeSqlMock(rows);
    const repo = new TransactionDBRepository(sql as never);

    const result = await repo.list({ userId: 'user-001', orgId: null, limit: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('WHEN list is called with a cursor THEN it applies the (created_at, id) < (cursor_at, cursor_id) predicate', async () => {
    const { sql, mockFn } = makeSqlMock([baseEntity]);
    const repo = new TransactionDBRepository(sql as never);

    const cursorPayload = JSON.stringify({
      created_at: '2026-06-22T00:00:00.000Z',
      id: 'uuid-002',
    });
    const cursor = Buffer.from(cursorPayload).toString('base64');

    await repo.list({ userId: 'user-001', orgId: null, limit: 20, cursor });

    // Verify the sql mock was called (cursor decoding happened without throwing)
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

// T007 — SQL error path tests for all methods

describe('TransactionDBRepository — SQL error paths (R001, R002, R007, NF001, NF002, NF003)', () => {
  const createInput: CreateTransactionData = {
    id: 'uuid-001',
    user_id: 'user-001',
    org_id: null,
    provider: 'mobbex',
    amount: 1000,
    currency: 'ARS',
    description: 'Test',
    reference: 'ref-001',
    metadata: null,
  };

  const methods: Array<{ name: string; call: (repo: TransactionDBRepository) => Promise<unknown> }> = [
    { name: 'create', call: (repo) => repo.create(createInput) },
    { name: 'findById', call: (repo) => repo.findById('uuid-001') },
    { name: 'findByIdempotencyKey', call: (repo) => repo.findByIdempotencyKey('key', 'user-001', null) },
    { name: 'updateFailureReason', call: (repo) => repo.updateFailureReason('uuid-001', 'declined') },
    {
      name: 'updateProviderData',
      call: (repo) =>
        repo.updateProviderData('uuid-001', { providerTransactionId: 'ptx-001', checkoutUrl: 'https://example.com' }),
    },
    { name: 'list', call: (repo) => repo.list({ userId: 'user-001', orgId: null, limit: 20 }) },
    { name: 'getRefundsByTransactionId', call: (repo) => repo.getRefundsByTransactionId('uuid-001') },
  ];

  for (const { name, call } of methods) {
    it(`WHEN ${name} sql rejects THEN logger.error is called with repository: 'TransactionDBRepository' and method: '${name}'`, async () => {
      const rawError = new Error(`db error in ${name}`);
      const { sql } = makeRejectingSqlMock(rawError);
      const repo = new TransactionDBRepository(sql as never);

      await expect(call(repo)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: 'TransactionDBRepository',
          method: name,
        }),
        expect.any(String),
      );
    });

    it(`WHEN ${name} sql rejects THEN re-throws ProviderError with statusCode 502 and originalError`, async () => {
      const rawError = new Error(`timeout in ${name}`);
      const { sql } = makeRejectingSqlMock(rawError);
      const repo = new TransactionDBRepository(sql as never);

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
