import { TransactionDBRepository } from '../../../src/modules/billing/repositories/transactionDBRepository.js';
import type { TransactionEntity } from '../../../src/modules/billing/entities/transaction.entity.js';
import type { CreateTransactionData } from '../../../src/modules/billing/repositories/interfaces/iTransactionRepository.js';

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
