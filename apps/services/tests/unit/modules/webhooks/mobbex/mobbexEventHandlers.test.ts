import { dispatchMobbexEvent } from '../../../../../src/modules/webhooks/mobbex/mobbexEventHandlers.js';
import type { IMobbexBillingSyncRepository } from '../../../../../src/modules/webhooks/repositories/interfaces/iMobbexBillingSyncRepository.js';

function makeRepo(updateOutcome: 'approved' | 'failed' | 'noop' | 'unresolved' = 'approved'): IMobbexBillingSyncRepository {
  const transactionId = updateOutcome !== 'unresolved' ? 'uuid-tx-001' : null;
  return {
    updateTransactionStatus: jest.fn().mockResolvedValue({ outcome: updateOutcome, transactionId }),
    recordEvent: jest.fn().mockResolvedValue(undefined),
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
