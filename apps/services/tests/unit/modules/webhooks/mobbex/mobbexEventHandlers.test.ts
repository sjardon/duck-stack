import { dispatchMobbexEvent } from '../../../../../src/modules/webhooks/mobbex/mobbexEventHandlers.js';
import type { IMobbexBillingSyncRepository } from '../../../../../src/modules/webhooks/repositories/interfaces/iMobbexBillingSyncRepository.js';

function makeRepo(updateOutcome: 'approved' | 'failed' | 'noop' | 'unresolved' = 'approved'): IMobbexBillingSyncRepository {
  const transactionId = updateOutcome !== 'unresolved' ? 'uuid-tx-001' : null;
  return {
    updateTransactionStatus: jest.fn().mockResolvedValue({ outcome: updateOutcome, transactionId }),
    recordEvent: jest.fn().mockResolvedValue(undefined),
    upsertRefundAndMaybeMarkTransactionRefunded: jest.fn().mockResolvedValue({ outcome: 'refund_approved', transactionId: 'uuid-tx-001' }),
    checkDuplicateEventId: jest.fn().mockResolvedValue(false),
    updateSubscriptionStatus: jest.fn().mockResolvedValue({ outcome: 'applied', subscriptionId: null, resolvedStatus: null }),
  };
}

function makeRefundRepo(refundOutcome: 'refund_approved' | 'refund_failed' | 'transaction_refunded' | 'unresolved' = 'refund_approved'): IMobbexBillingSyncRepository {
  const transactionId = refundOutcome !== 'unresolved' ? 'uuid-tx-001' : null;
  return {
    updateTransactionStatus: jest.fn().mockResolvedValue({ outcome: 'noop', transactionId: null }),
    recordEvent: jest.fn().mockResolvedValue(undefined),
    upsertRefundAndMaybeMarkTransactionRefunded: jest.fn().mockResolvedValue({ outcome: refundOutcome, transactionId }),
    checkDuplicateEventId: jest.fn().mockResolvedValue(false),
    updateSubscriptionStatus: jest.fn().mockResolvedValue({ outcome: 'applied', subscriptionId: null, resolvedStatus: null }),
  };
}

// T010 — success event

describe('dispatchMobbexEvent — success event', () => {
  it('WHEN payload type is "payment.success" THEN calls updateTransactionStatus with status "approved"', async () => {
    const repo = makeRepo('approved');
    const payload = {
      type: 'payment.success',
      data: { id: 'ptx-001', reference: 'ref-001' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.updateTransactionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        providerTransactionId: 'ptx-001',
        reference: 'ref-001',
      }),
    );
  });

  it('WHEN payload type is "checkout.success" THEN calls updateTransactionStatus with status "approved"', async () => {
    const repo = makeRepo('approved');
    const payload = {
      type: 'checkout.success',
      data: { id: 'ptx-002', reference: 'ref-002' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.updateTransactionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('WHEN a success event is dispatched THEN recordEvent is called with the correct eventType', async () => {
    const repo = makeRepo('approved');
    const payload = {
      type: 'payment.success',
      data: { id: 'ptx-001', reference: 'ref-001' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.success' }),
    );
  });

  it('WHEN event type is unknown THEN updateTransactionStatus is NOT called but recordEvent IS called', async () => {
    const repo = makeRepo();
    const payload = {
      type: 'subscription.created',
      data: { id: 'ptx-003' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.updateTransactionStatus).not.toHaveBeenCalled();
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('WHEN event type is unknown THEN returns "unresolved"', async () => {
    const repo = makeRepo();
    const payload = {
      type: 'subscription.created',
      data: {},
    };

    const outcome = await dispatchMobbexEvent(payload, repo);

    expect(outcome).toBe('unresolved');
  });
});

// T011 — failure event

describe('dispatchMobbexEvent — failure event', () => {
  it('WHEN payload type is "payment.failure" THEN calls updateTransactionStatus with status "failed" and failureReason', async () => {
    const repo = makeRepo('failed');
    const payload = {
      type: 'payment.failure',
      data: { id: 'ptx-001', reference: 'ref-001', message: 'declined' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.updateTransactionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'declined',
        providerTransactionId: 'ptx-001',
        reference: 'ref-001',
      }),
    );
  });

  it('WHEN payload type is "payment.rejected" THEN calls updateTransactionStatus with status "failed"', async () => {
    const repo = makeRepo('failed');
    const payload = {
      type: 'payment.rejected',
      data: { id: 'ptx-002', reference: 'ref-002', message: 'rejected by bank' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.updateTransactionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('WHEN a failure event is dispatched THEN recordEvent is called', async () => {
    const repo = makeRepo('failed');
    const payload = {
      type: 'payment.failure',
      data: { id: 'ptx-001', reference: 'ref-001', message: 'declined' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('WHEN data.id and data.reference are both absent THEN both fields are null in updateTransactionStatus call', async () => {
    const repo = makeRepo('unresolved');
    const payload = {
      type: 'payment.failure',
      data: { message: 'no id or reference' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.updateTransactionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTransactionId: null,
        reference: null,
      }),
    );
  });
});

// T014 — refund.success event

describe('dispatchMobbexEvent — refund.success event', () => {
  it('WHEN event_type is "refund.success" with valid refund_id and positive amount THEN upsertRefundAndMaybeMarkTransactionRefunded is called with refundStatus "approved" and recordEvent is called afterward', async () => {
    const repo = makeRefundRepo('refund_approved');
    const payload = {
      type: 'refund.success',
      data: { id: 'ptx-001', refund_id: 'prov-refund-001', amount: 500, reason: 'Customer request' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.upsertRefundAndMaybeMarkTransactionRefunded).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTransactionId: 'ptx-001',
        providerRefundId: 'prov-refund-001',
        amount: 500,
        reason: 'Customer request',
        refundStatus: 'approved',
      }),
    );
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
    expect(repo.updateTransactionStatus).not.toHaveBeenCalled();
  });
});

// T015 — refund.failure event

describe('dispatchMobbexEvent — refund.failure event', () => {
  it('WHEN event_type is "refund.failure" THEN upsertRefundAndMaybeMarkTransactionRefunded is called with refundStatus "failed" and recordEvent is called', async () => {
    const repo = makeRefundRepo('refund_failed');
    const payload = {
      type: 'refund.failure',
      data: { id: 'ptx-001', refund_id: 'prov-refund-002', amount: 300, reason: 'Declined' },
    };

    await dispatchMobbexEvent(payload, repo);

    expect(repo.upsertRefundAndMaybeMarkTransactionRefunded).toHaveBeenCalledWith(
      expect.objectContaining({
        refundStatus: 'failed',
        providerRefundId: 'prov-refund-002',
        amount: 300,
      }),
    );
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
  });
});

// T016 — missing providerRefundId

describe('dispatchMobbexEvent — missing providerRefundId', () => {
  it('WHEN data.refund_id is absent THEN upsertRefundAndMaybeMarkTransactionRefunded is NOT called, recordEvent IS called with transactionId: null, and outcome is "unresolved"', async () => {
    const repo = makeRefundRepo();
    const payload = {
      type: 'refund.success',
      data: { id: 'ptx-001', amount: 500 }, // no refund_id
    };

    const outcome = await dispatchMobbexEvent(payload, repo);

    expect(repo.upsertRefundAndMaybeMarkTransactionRefunded).not.toHaveBeenCalled();
    expect(repo.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: null }),
    );
    expect(outcome).toBe('unresolved');
  });
});

// T017 — missing or non-positive amount

describe('dispatchMobbexEvent — missing or non-positive amount', () => {
  it('WHEN data.amount is absent THEN upsertRefundAndMaybeMarkTransactionRefunded is NOT called, recordEvent IS called with transactionId: null, and outcome is "unresolved"', async () => {
    const repo = makeRefundRepo();
    const payload = {
      type: 'refund.success',
      data: { id: 'ptx-001', refund_id: 'prov-refund-003' }, // no amount
    };

    const outcome = await dispatchMobbexEvent(payload, repo);

    expect(repo.upsertRefundAndMaybeMarkTransactionRefunded).not.toHaveBeenCalled();
    expect(repo.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: null }),
    );
    expect(outcome).toBe('unresolved');
  });

  it('WHEN data.amount is zero THEN upsertRefundAndMaybeMarkTransactionRefunded is NOT called and outcome is "unresolved"', async () => {
    const repo = makeRefundRepo();
    const payload = {
      type: 'refund.success',
      data: { id: 'ptx-001', refund_id: 'prov-refund-004', amount: 0 },
    };

    const outcome = await dispatchMobbexEvent(payload, repo);

    expect(repo.upsertRefundAndMaybeMarkTransactionRefunded).not.toHaveBeenCalled();
    expect(outcome).toBe('unresolved');
  });

  it('WHEN data.amount is negative THEN upsertRefundAndMaybeMarkTransactionRefunded is NOT called and outcome is "unresolved"', async () => {
    const repo = makeRefundRepo();
    const payload = {
      type: 'refund.failure',
      data: { id: 'ptx-001', refund_id: 'prov-refund-005', amount: -100 },
    };

    const outcome = await dispatchMobbexEvent(payload, repo);

    expect(repo.upsertRefundAndMaybeMarkTransactionRefunded).not.toHaveBeenCalled();
    expect(outcome).toBe('unresolved');
  });
});
