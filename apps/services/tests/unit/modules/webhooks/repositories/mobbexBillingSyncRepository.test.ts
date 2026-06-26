// Mock the static logger so we can spy on its methods
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { MobbexBillingSyncRepository } from '../../../../../src/modules/webhooks/repositories/mobbexBillingSyncRepository.js';
import { ProviderError } from '../../../../../src/shared/errors.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';
import type {
  UpsertRefundInput,
  UpdateSubscriptionStatusInput,
} from '../../../../../src/modules/webhooks/repositories/interfaces/iMobbexBillingSyncRepository.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

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

function makeRejectingSimpleSqlMock(error: Error) {
  const mockFn = jest.fn().mockRejectedValue(error);
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

/**
 * Creates a sql mock where the first `callsBeforeError` inner sql calls resolve
 * and the next call rejects with `error`. Used to test inner try/catch in sql.begin blocks.
 */
function makeSqlBeginWithInnerReject(error: Error, callsBeforeError: number = 0) {
  const innerMockFn = jest.fn();
  for (let i = 0; i < callsBeforeError; i++) {
    innerMockFn.mockResolvedValueOnce([]);
  }
  innerMockFn.mockRejectedValueOnce(error);

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

// T001 / T005 — recordEvent

describe('MobbexBillingSyncRepository.recordEvent', () => {
  it('WHEN recordEvent is called with a transactionId THEN inserts into billing_webhook_events with all required fields', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);

    await repo.recordEvent({
      eventType: 'payment.success',
      payload: { type: 'payment.success', data: { id: 'ptx-001' } },
      transactionId: 'uuid-tx-001',
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('WHEN recordEvent is called with transactionId null THEN insert still executes with NULL transaction_id', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);

    await repo.recordEvent({
      eventType: 'payment.success',
      payload: { type: 'payment.success', data: {} },
      transactionId: null,
    });

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

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-001',
      reference: null,
      status: 'approved',
    });

    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('approved');
    expect(result.transactionId).toBe('uuid-tx-001');
  });

  it('WHEN the transaction already has status "approved" THEN no UPDATE is issued and returns "noop"', async () => {
    const approvedTx = { id: 'uuid-tx-001', status: 'approved' };
    const { sql, beginMock, innerMockFn } = makeSqlBegin([approvedTx]);

    innerMockFn.mockResolvedValueOnce([approvedTx]);

    const repo = new MobbexBillingSyncRepository(sql as never);

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-001',
      reference: null,
      status: 'approved',
    });

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

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-001',
      reference: 'ref-001',
      status: 'failed',
      failureReason: 'Card declined',
    });

    expect(result.outcome).toBe('failed');
    expect(result.transactionId).toBe('uuid-tx-001');
  });

  it('WHEN no transaction is found by provider_transaction_id or reference THEN returns "unresolved" without UPDATE', async () => {
    const { sql, innerMockFn } = makeSqlBegin([]);

    // SELECT returns empty — no transaction found
    innerMockFn.mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);

    const result = await repo.updateTransactionStatus({
      providerTransactionId: 'ptx-999',
      reference: 'ref-999',
      status: 'failed',
      failureReason: 'Not found',
    });

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

    const result = await repo.updateTransactionStatus({
      providerTransactionId: null,
      reference: 'ref-001',
      status: 'failed',
      failureReason: 'Declined',
    });

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

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-001',
      amount: 500,
      reason: null,
      refundStatus: 'approved',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input);

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

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-001',
      amount: 1000,
      reason: null,
      refundStatus: 'approved',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input);

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

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-002',
      amount: 500,
      reason: 'Provider declined',
      refundStatus: 'failed',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input);

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

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-nonexistent',
      providerRefundId: 'prov-refund-003',
      amount: 500,
      reason: null,
      refundStatus: 'approved',
    };

    const result = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input);

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

    const input: UpsertRefundInput = {
      providerTransactionId: 'ptx-001',
      providerRefundId: 'prov-refund-idem',
      amount: 500,
      reason: null,
      refundStatus: 'approved',
    };

    const firstResult = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input);
    expect(firstResult.outcome).toBe('refund_approved');

    // Reset mock for second delivery
    innerMockFn.mockReset();
    innerMockFn
      .mockResolvedValueOnce([approvedTx])  // SELECT transaction
      .mockResolvedValueOnce([])             // UPSERT refunds (ON CONFLICT DO UPDATE — no duplicate)
      .mockResolvedValueOnce([{ total_approved: '500' }]); // SUM — still partial (same refund)

    const secondResult = await repo.upsertRefundAndMaybeMarkTransactionRefunded(input);
    expect(secondResult.outcome).toBe('refund_approved');
    expect(secondResult.transactionId).toBe('uuid-tx-001');
    // 3 inner SQL calls for the second delivery too
    expect(innerMockFn).toHaveBeenCalledTimes(3);
  });
});

// T011 — SQL error paths for recordEvent and transactional sub-queries

describe('MobbexBillingSyncRepository.recordEvent — SQL error path (R001, R002, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects THEN logger.error is called once with repository: \'MobbexBillingSyncRepository\' and method: \'recordEvent\'', async () => {
    const rawError = new Error('insert failed');
    const { sql } = makeRejectingSimpleSqlMock(rawError);
    const repo = new MobbexBillingSyncRepository(sql as never);

    await expect(
      repo.recordEvent({ eventType: 'payment.success', payload: {}, transactionId: null }),
    ).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'MobbexBillingSyncRepository',
        method: 'recordEvent',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError', async () => {
    const rawError = new Error('timeout');
    const { sql } = makeRejectingSimpleSqlMock(rawError);
    const repo = new MobbexBillingSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.recordEvent({ eventType: 'payment.success', payload: {}, transactionId: null });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

describe('MobbexBillingSyncRepository.updateTransactionStatus — SELECT by provider_transaction_id sub-query error (R004, EC001)', () => {
  it('WHEN the first SELECT sub-query rejects THEN logger.error is called exactly once and ProviderError(502) is thrown', async () => {
    const rawError = new Error('select by ptxId failed');
    // 0 calls succeed before the error, so the first SELECT call fails immediately
    const { sql } = makeSqlBeginWithInnerReject(rawError, 0);
    const repo = new MobbexBillingSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.updateTransactionStatus({ providerTransactionId: 'ptx-001', reference: null, status: 'approved' });
    } catch (e) {
      thrown = e;
    }

    // logger.error must be called exactly once (not double-logged by outer catch)
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

describe('MobbexBillingSyncRepository.updateTransactionStatus — UPDATE sub-query error (R004, EC001)', () => {
  it('WHEN the UPDATE sub-query rejects THEN logger.error is called exactly once and ProviderError(502) is thrown', async () => {
    const rawError = new Error('update failed');
    const pendingTx = { id: 'uuid-tx-001', status: 'pending' };
    const innerMockFn = jest.fn()
      .mockResolvedValueOnce([pendingTx])  // SELECT by provider_transaction_id
      .mockRejectedValueOnce(rawError);    // UPDATE fails

    const innerSql = (strings: TemplateStringsArray, ..._values: unknown[]) =>
      innerMockFn(strings, ..._values);

    const beginMock = jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(innerSql);
    });

    const outerMockFn = jest.fn().mockResolvedValue([]);
    const sql = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => outerMockFn(strings, ..._values),
      outerMockFn,
      { begin: beginMock, json: (val: unknown) => val },
    );

    const repo = new MobbexBillingSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.updateTransactionStatus({ providerTransactionId: 'ptx-001', reference: null, status: 'approved' });
    } catch (e) {
      thrown = e;
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

describe('MobbexBillingSyncRepository.updateTransactionStatus — reference fallback SELECT error (EC002)', () => {
  it('WHEN the reference fallback SELECT rejects THEN logger.error includes reference in the payload', async () => {
    const rawError = new Error('reference select failed');
    // First call (SELECT by ptxId) returns empty, second call (SELECT by reference) fails
    const innerMockFn = jest.fn()
      .mockResolvedValueOnce([])          // SELECT by provider_transaction_id returns empty
      .mockRejectedValueOnce(rawError);   // SELECT by reference fails

    const innerSql = (strings: TemplateStringsArray, ..._values: unknown[]) =>
      innerMockFn(strings, ..._values);

    const beginMock = jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(innerSql);
    });

    const outerMockFn = jest.fn().mockResolvedValue([]);
    const sql = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => outerMockFn(strings, ..._values),
      outerMockFn,
      { begin: beginMock, json: (val: unknown) => val },
    );

    const repo = new MobbexBillingSyncRepository(sql as never);

    await expect(
      repo.updateTransactionStatus({ providerTransactionId: 'ptx-001', reference: 'ref-001', status: 'failed' }),
    ).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'ref-001',
      }),
      expect.any(String),
    );
  });
});

describe('MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded — SELECT transaction sub-query error (R004, EC001)', () => {
  it('WHEN the SELECT-transaction sub-query rejects THEN logger.error is called exactly once and ProviderError(502) is thrown', async () => {
    const rawError = new Error('select transaction failed');
    // First inner call (SELECT by ptxId) fails immediately
    const { sql } = makeSqlBeginWithInnerReject(rawError, 0);
    const repo = new MobbexBillingSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.upsertRefundAndMaybeMarkTransactionRefunded({
        providerTransactionId: 'ptx-001',
        providerRefundId: 'ref-001',
        amount: 500,
        reason: null,
        refundStatus: 'approved',
      });
    } catch (e) {
      thrown = e;
    }

    // logger.error called exactly once (not double-logged by outer catch)
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

// T003 — checkDuplicateEventId

describe('MobbexBillingSyncRepository.checkDuplicateEventId', () => {
  it('WHEN the DB returns a row with the given provider+event_id THEN returns true', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([{ '?column?': 1 }]);
    const repo = new MobbexBillingSyncRepository(sql as never);

    const result = await repo.checkDuplicateEventId('evt-001', 'mobbex');

    expect(result).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('WHEN no matching row exists THEN returns false', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);

    const result = await repo.checkDuplicateEventId('evt-nonexistent', 'mobbex');

    expect(result).toBe(false);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

// T005 — recordEvent extended with subscriptionId and eventId

describe('MobbexBillingSyncRepository.recordEvent — subscriptionId and eventId fields (R008)', () => {
  it('WHEN recordEvent is called with subscriptionId and eventId THEN insert receives subscription_id and event_id', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);

    await repo.recordEvent({
      eventType: 'subscription.activated',
      payload: { type: 'subscription.activated' },
      transactionId: null,
      subscriptionId: 'sub-001',
      eventId: 'evt-001',
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    const call = mockFn.mock.calls[0] as unknown[];
    expect(call[4]).toBe('sub-001');
    expect(call[5]).toBe('evt-001');
  });

  it('WHEN recordEvent is called without subscriptionId or eventId THEN both columns default to null', async () => {
    const { sql, mockFn } = makeSimpleSqlMock([]);
    const repo = new MobbexBillingSyncRepository(sql as never);

    await repo.recordEvent({
      eventType: 'subscription.activated',
      payload: { type: 'subscription.activated' },
      transactionId: null,
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    const call = mockFn.mock.calls[0] as unknown[];
    expect(call[4]).toBeNull();
    expect(call[5]).toBeNull();
  });
});

// T007 — updateSubscriptionStatus: activated event

describe('MobbexBillingSyncRepository.updateSubscriptionStatus — activated event (R002, R009)', () => {
  it('WHEN eventType is subscription.activated and subscription is pending THEN updates status to active and returns applied', async () => {
    const pendingSub = { id: 'sub-001', status: 'pending', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([pendingSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const input: UpdateSubscriptionStatusInput = {
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.activated',
      currentPeriodStart: '2026-06-01T00:00:00Z',
      currentPeriodEnd: '2026-07-01T00:00:00Z',
    };

    const result = await repo.updateSubscriptionStatus(input);

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.subscriptionId).toBe('sub-001');
    expect(result.resolvedStatus).toBe('pending');
  });

  it('WHEN eventType is subscription.activated and subscription is already active with matching periods THEN returns noop without UPDATE (R009)', async () => {
    const activeSub = {
      id: 'sub-001',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00Z',
      current_period_end: '2026-07-01T00:00:00Z',
    };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([activeSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const input: UpdateSubscriptionStatusInput = {
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.activated',
      currentPeriodStart: '2026-06-01T00:00:00Z',
      currentPeriodEnd: '2026-07-01T00:00:00Z',
    };

    const result = await repo.updateSubscriptionStatus(input);

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
    expect(result.subscriptionId).toBe('sub-001');
  });
});

// T008 — updateSubscriptionStatus: renewed event

describe('MobbexBillingSyncRepository.updateSubscriptionStatus — renewed event (R003, R004, EC001, R009)', () => {
  it('WHEN eventType is subscription.renewed and subscription is active with matching current_period_end THEN returns noop (R009)', async () => {
    const activeSub = {
      id: 'sub-001',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00Z',
      current_period_end: '2026-07-01T00:00:00Z',
    };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([activeSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.renewed',
      currentPeriodEnd: '2026-07-01T00:00:00Z',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
  });

  it('WHEN eventType is subscription.renewed and subscription is past_due THEN updates status to active and current_period_end (R004)', async () => {
    const pastDueSub = {
      id: 'sub-001',
      status: 'past_due',
      current_period_start: '2026-06-01T00:00:00Z',
      current_period_end: '2026-07-01T00:00:00Z',
    };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([pastDueSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.renewed',
      currentPeriodEnd: '2026-08-01T00:00:00Z',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.resolvedStatus).toBe('past_due');
  });

  it('WHEN eventType is subscription.renewed and subscription is pending THEN updates status to active with period_start and period_end (EC001)', async () => {
    const pendingSub = {
      id: 'sub-001',
      status: 'pending',
      current_period_start: null,
      current_period_end: null,
    };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([pendingSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.renewed',
      currentPeriodStart: '2026-06-01T00:00:00Z',
      currentPeriodEnd: '2026-07-01T00:00:00Z',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.resolvedStatus).toBe('pending');
  });

  it('WHEN eventType is subscription.renewed and subscription is active with different current_period_end THEN updates only current_period_end (R003)', async () => {
    const activeSub = {
      id: 'sub-001',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00Z',
      current_period_end: '2026-07-01T00:00:00Z',
    };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([activeSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.renewed',
      currentPeriodEnd: '2026-08-01T00:00:00Z',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.resolvedStatus).toBe('active');
  });
});

// T009 — updateSubscriptionStatus: payment_failed event

describe('MobbexBillingSyncRepository.updateSubscriptionStatus — payment_failed event (R005, EC002, R009)', () => {
  it('WHEN eventType is subscription.payment_failed and subscription is active THEN updates status to past_due (R005)', async () => {
    const activeSub = { id: 'sub-001', status: 'active', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([activeSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.payment_failed',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.resolvedStatus).toBe('active');
  });

  it('WHEN eventType is subscription.payment_failed and subscription is already past_due THEN returns noop without UPDATE (R009)', async () => {
    const pastDueSub = { id: 'sub-001', status: 'past_due', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([pastDueSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.payment_failed',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
  });

  it('WHEN eventType is subscription.payment_failed and subscription is canceled THEN returns noop without UPDATE (EC002)', async () => {
    const canceledSub = { id: 'sub-001', status: 'canceled', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([canceledSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.payment_failed',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
  });

  it('WHEN eventType is subscription.payment_failed and subscription is expired THEN returns noop without UPDATE (EC002)', async () => {
    const expiredSub = { id: 'sub-001', status: 'expired', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([expiredSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.payment_failed',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
  });
});

// T010 — updateSubscriptionStatus: canceled event

describe('MobbexBillingSyncRepository.updateSubscriptionStatus — canceled event (R006, R009)', () => {
  it('WHEN eventType is subscription.canceled and subscription is active THEN updates status to canceled and sets canceled_at (R006)', async () => {
    const activeSub = { id: 'sub-001', status: 'active', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([activeSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.canceled',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.resolvedStatus).toBe('active');
  });

  it('WHEN eventType is subscription.canceled and subscription is already canceled THEN returns noop without UPDATE (R009)', async () => {
    const canceledSub = { id: 'sub-001', status: 'canceled', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([canceledSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.canceled',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
  });
});

// T011 — updateSubscriptionStatus: expired event

describe('MobbexBillingSyncRepository.updateSubscriptionStatus — expired event (R007, R009)', () => {
  it('WHEN eventType is subscription.expired and subscription is active THEN updates status to expired (R007)', async () => {
    const activeSub = { id: 'sub-001', status: 'active', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn
      .mockResolvedValueOnce([activeSub])
      .mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.expired',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('applied');
    expect(result.resolvedStatus).toBe('active');
  });

  it('WHEN eventType is subscription.expired and subscription is already expired THEN returns noop without UPDATE (R009)', async () => {
    const expiredSub = { id: 'sub-001', status: 'expired', current_period_start: null, current_period_end: null };
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([expiredSub]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-1',
      eventType: 'subscription.expired',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('noop');
  });
});

// T012 — updateSubscriptionStatus: orphan when subscription not found

describe('MobbexBillingSyncRepository.updateSubscriptionStatus — orphan (EC003)', () => {
  it('WHEN the SELECT returns no rows THEN returns orphan with null subscriptionId and resolvedStatus', async () => {
    const { sql, innerMockFn } = makeSqlBegin([]);

    innerMockFn.mockResolvedValueOnce([]);

    const repo = new MobbexBillingSyncRepository(sql as never);
    const result = await repo.updateSubscriptionStatus({
      providerSubscriptionId: 'psub-nonexistent',
      eventType: 'subscription.activated',
    });

    expect(innerMockFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('orphan');
    expect(result.subscriptionId).toBeNull();
    expect(result.resolvedStatus).toBeNull();
  });
});
