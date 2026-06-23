import { MobbexBillingSyncRepository } from '../../../../../src/modules/webhooks/repositories/mobbexBillingSyncRepository.js';

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
