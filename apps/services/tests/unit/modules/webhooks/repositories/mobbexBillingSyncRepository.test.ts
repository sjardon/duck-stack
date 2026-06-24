import { MobbexBillingSyncRepository } from '../../../../../src/modules/webhooks/repositories/mobbexBillingSyncRepository.js';
import type { UpsertRefundInput } from '../../../../../src/modules/webhooks/repositories/interfaces/iMobbexBillingSyncRepository.js';
import type { BaseLogger } from 'pino';

function makeLogger(): BaseLogger {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    silent: jest.fn(),
    level: 'info',
    child: jest.fn(),
  } as unknown as BaseLogger;
}

// Helpers to build sql mocks

function makeSqlBegin(returnValue: unknown = []) {
  const innerMockFn = jest.fn().mockResolvedValue(returnValue);
  const innerSql = (strings: TemplateStringsArray, ..._values: unknown[]) =>
    innerMockFn(strings, ..._values);

  const beginMock = jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb(innerSql);
  });

  const outerMockFn = jest.fn().mockResolvedValue([]);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => outerMockFn(strings, ..._values),
    outerMockFn,
    {
      begin: beginMock,
      json: (val: unknown) => val,
    },
  );

  return { sql, outerMockFn, innerMockFn, beginMock };
}

function makeSimpleSqlMock(returnValue: unknown = []) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
    {
      json: (val: unknown) => val,
      begin: jest.fn(),
    },
  );
  return { sql, mockFn };
}

// T001 / T005 — recordEvent

describe('MobbexBillingSyncRepository.recordEvent', () => {
  it('WHEN recordEvent is called with a transactionId THEN inserts into billing_webhook_events with all required fields', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.recordEvent({
      eventType: 'payment.success',
      payload: { type: 'payment.success', data: { id: 'ptx-001' } },
      transactionId: 'uuid-tx-001',
    }, fakeLogger);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });

  it('WHEN recordEvent is called with transactionId null THEN insert still executes with NULL transaction_id', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.recordEvent({
      eventType: 'payment.success',
      payload: { type: 'payment.success', data: {} },
      transactionId: null,
    }, fakeLogger);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

// T007 — updateTransactionStatus approved path

describe('MobbexBillingSyncRepository.updateTransactionStatus — approved path', () => {
  it('WHEN a pending transaction is found by provider_transaction_id THEN updates status and returns "approved"', async () => {
    const pendingTx = { id: 'uuid-tx-001', status: 'pending' };
    const { sql, beginMock, innerMockFn } = makeSqlBegin([pendingTx]);

    // First call inside begin: SELECT returns pendingTx; second call: UPDATE returns []
    innerMockFn
      .mockResolvedValueOnce([pendingTx])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-001',
      reference: null,
      status: 'approved',
    }, fakeLogger);

    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('approved');
    expect(result.transactionId).toBe('uuid-tx-001');
  });

  it('WHEN the transaction already has status "approved" THEN no UPDATE is issued and returns "noop"', async () => {
    const approvedTx = { id: 'uuid-tx-001', status: 'approved' };
    const { sql, beginMock, innerMockFn } = makeSqlBegin([approvedTx]);

    innerMockFn.mockResolvedValueOnce([approvedTx]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-001',
      reference: null,
      status: 'approved',
    }, fakeLogger);

    expect(beginMock).toHaveBeenCalledTimes(1);
    // Only SELECT was called, no UPDATE
    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
    expect(result.transactionId).toBe('uuid-tx-001');
  });
});

// T008 — updateTransactionStatus failed path

describe('MobbexBillingSyncRepository.updateTransactionStatus — failed path', () => {
  it('WHEN a transaction is found THEN updates status to failed with failure_reason and returns "failed"', async () => {
    const pendingTx = { id: 'uuid-tx-001', status: 'pending' };
    const { sql, innerMockFn } = makeSqlBegin([pendingTx]);

    innerMockFn
      .mockResolvedValueOnce([pendingTx])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-001',
      reference: 'ref-001',
      status: 'failed',
      failureReason: 'Card declined',
    }, fakeLogger);

    expect(result.outcome).toBe('failed');
    expect(result.transactionId).toBe('uuid-tx-001');
  });

  it('WHEN no transaction is found by provider_transaction_id or reference THEN returns "unresolved" without UPDATE', async () => {
    const { sql, innerMockFn } = makeSqlBegin([]);

    // SELECT returns empty — no transaction found
    innerMockFn.mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-999',
      reference: 'ref-999',
      status: 'failed',
      failureReason: 'Not found',
    }, fakeLogger);

    expect(result.outcome).toBe('unresolved');
    expect(result.transactionId).toBeNull();
    // Two SELECT calls (one by provider_transaction_id, one by reference), no UPDATE
    expect(innerMockFn).toHaveBeenCalledTimes(2);
  });

  it('WHEN providerTransactionId is null THEN falls back to reference lookup', async () => {
    const pendingTx = { id: 'uuid-tx-001', status: 'pending' };
    const { sql, innerMockFn } = makeSqlBegin([pendingTx]);

    innerMockFn
      .mockResolvedValueOnce([pendingTx])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const result = await repo.updateTransactionStatus({
      providerTransactionId: null,
      reference: 'ref-001',
      status: 'failed',
      failureReason: 'Declined',
    }, fakeLogger);

    expect(result.outcome).toBe('failed');
    expect(result.transactionId).toBe('uuid-tx-001');
  });
});

// ─── upsertRefundAndMaybeMarkTransactionRefunded ───────────────────────────

// T008 — approved refund (partial): cumulative sum < transaction.amount

describe('MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded — approved partial refund', () => {
  it('WHEN refundStatus is "approved" and cumulative sum is less than transaction amount THEN returns { outcome: "refund_approved", transactionId } and does not update transactions.status', async () => {
    const approvedTx = { id: 'uuid-tx-001', amount: 1000, status: 'approved' };
    const { sql, innerMockFn } = makeSqlBegin([]);

    // Call sequence inside sql.begin:
    // 1. SELECT transaction by provider_transaction_id → [approvedTx]
    // 2. INSERT INTO refunds ON CONFLICT DO UPDATE → []
    // 3. SELECT SUM(amount) approved refunds → [{ total_approved: '500' }]
    // (no UPDATE because sum < amount)
    innerMockFn
      .mockResolvedValueOnce([approvedTx])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total_approved: '500' }]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-001',
      amount: 500,
      reason: null,
      refundStatus: 'approved',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input, fakeLogger);

    expect(result.outcome).toBe('refund_approved');
    expect(result.transactionId).toBe('uuid-tx-001');
    // No UPDATE on transactions — only 3 inner SQL calls
    expect(innerMockFn).toHaveBeenCalledTimes(3);
  });
});

// T009 — full refund triggers status transition

describe('MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded — full refund', () => {
  it('WHEN cumulative approved refund amount equals transaction amount THEN updates transactions.status to "refunded" and returns { outcome: "transaction_refunded", transactionId }', async () => {
    const approvedTx = { id: 'uuid-tx-001', amount: 1000, status: 'approved' };
    const { sql, innerMockFn } = makeSqlBegin([]);

    // Call sequence:
    // 1. SELECT transaction → [approvedTx]
    // 2. INSERT refunds ON CONFLICT → []
    // 3. SELECT SUM → [{ total_approved: '1000' }]
    // 4. UPDATE transactions SET status='refunded' → []
    innerMockFn
      .mockResolvedValueOnce([approvedTx])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total_approved: '1000' }])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-001',
      amount: 1000,
      reason: null,
      refundStatus: 'approved',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input, fakeLogger);

    expect(result.outcome).toBe('transaction_refunded');
    expect(result.transactionId).toBe('uuid-tx-001');
    // 4 inner SQL calls including the UPDATE
    expect(innerMockFn).toHaveBeenCalledTimes(4);
  });
});

// T010 — failed refund: no transactions.status change

describe('MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded — failed refund', () => {
  it('WHEN refundStatus is "failed" THEN upserts refund row with status "failed", does not modify transactions.status, and returns { outcome: "refund_failed", transactionId }', async () => {
    const approvedTx = { id: 'uuid-tx-001', amount: 1000, status: 'approved' };
    const { sql, innerMockFn } = makeSqlBegin([]);

    // Call sequence:
    // 1. SELECT transaction → [approvedTx]
    // 2. INSERT refunds ON CONFLICT → []
    // (no SUM or UPDATE because refundStatus = 'failed')
    innerMockFn
      .mockResolvedValueOnce([approvedTx])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-002',
      amount: 500,
      reason: 'Provider declined',
      refundStatus: 'failed',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input, fakeLogger);

    expect(result.outcome).toBe('refund_failed');
    expect(result.transactionId).toBe('uuid-tx-001');
    // Only SELECT + INSERT; no SUM or UPDATE
    expect(innerMockFn).toHaveBeenCalledTimes(2);
  });
});

// T011 — transaction not found

describe('MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded — transaction not found', () => {
  it('WHEN provider_transaction_id does not match any transaction THEN no refund row is inserted and returns { outcome: "unresolved", transactionId: null }', async () => {
    const { sql, innerMockFn } = makeSqlBegin([]);

    // SELECT returns empty — transaction not found
    innerMockFn.mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-nonexistent',
      providerRefundId: 'prov-refund-003',
      amount: 500,
      reason: null,
      refundStatus: 'approved',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input, fakeLogger);

    expect(result.outcome).toBe('unresolved');
    expect(result.transactionId).toBeNull();
    // Only the SELECT was called; no INSERT
    expect(innerMockFn).toHaveBeenCalledTimes(1);
  });
});

// T012 — idempotent re-delivery

describe('MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded — idempotent re-delivery', () => {
  it('WHEN the same provider_refund_id is received twice THEN the second upsert produces no duplicate and the cumulative sum is recomputed correctly', async () => {
    const approvedTx = { id: 'uuid-tx-001', amount: 1000, status: 'approved' };
    const { sql, innerMockFn } = makeSqlBegin([]);

    // First delivery: partial refund
    innerMockFn
      .mockResolvedValueOnce([approvedTx])  // SELECT transaction
      .mockResolvedValueOnce([])             // UPSERT refunds
      .mockResolvedValueOnce([{ total_approved: '500' }]); // SUM — partial

    const repo = new MobbexBillingSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-idem',
      amount: 500,
      reason: null,
      refundStatus: 'approved',
    };

    const firstResult = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input, fakeLogger);
    expect(firstResult.outcome).toBe('refund_approved');

    // Reset mock for second delivery
    innerMockFn.mockReset();
    innerMockFn
      .mockResolvedValueOnce([approvedTx])  // SELECT transaction
      .mockResolvedValueOnce([])             // UPSERT refunds (ON CONFLICT DO UPDATE — no duplicate)
      .mockResolvedValueOnce([{ total_approved: '500' }]); // SUM — still partial (same refund)

    const secondResult = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input, fakeLogger);
    expect(secondResult.outcome).toBe('refund_approved');
    expect(secondResult.transactionId).toBe('uuid-tx-001');
    // 3 inner SQL calls for the second delivery too
    expect(innerMockFn).toHaveBeenCalledTimes(3);
  });
});
