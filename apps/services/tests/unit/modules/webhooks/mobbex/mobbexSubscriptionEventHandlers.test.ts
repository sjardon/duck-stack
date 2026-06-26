jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { dispatchMobbexSubscriptionEvent } from '../../../../../src/modules/webhooks/mobbex/mobbexSubscriptionEventHandlers.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';
import type { IMobbexBillingSyncRepository } from '../../../../../src/modules/webhooks/repositories/interfaces/iMobbexBillingSyncRepository.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

function makeMockRepo(overrides: Partial<IMobbexBillingSyncRepository> = {}): IMobbexBillingSyncRepository {
  return {
    recordEvent: jest.fn().mockResolvedValue(undefined),
    updateSubscriptionStatus: jest.fn().mockResolvedValue({ outcome: 'applied', subscriptionId: 'sub-001', resolvedStatus: 'pending' }),
    checkDuplicateEventId: jest.fn().mockResolvedValue(false),
    updateTransactionStatus: jest.fn(),
    upsertRefundAndMaybeMarkTransactionRefunded: jest.fn(),
    ...overrides,
  } as unknown as IMobbexBillingSyncRepository;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T014 — duplicate event_id returns early without recording

describe('dispatchMobbexSubscriptionEvent — duplicate event_id (R010, EC005)', () => {
  it('WHEN payload data.event_id is a known duplicate THEN returns duplicate AND recordEvent is NOT called AND updateSubscriptionStatus is NOT called', async () => {
    const repo = makeMockRepo({
      checkDuplicateEventId: jest.fn().mockResolvedValue(true),
    });

    const payload = {
      type: 'subscription.activated',
      data: { event_id: 'evt-dup', subscription_id: 'psub-1' },
    };

    const outcome = await dispatchMobbexSubscriptionEvent(payload, repo);

    expect(outcome).toBe('duplicate');
    expect(repo.recordEvent).not.toHaveBeenCalled();
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [logPayload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(logPayload.outcome).toBe('duplicate');
  });
});

// T015 — unknown event type records and returns unknown

describe('dispatchMobbexSubscriptionEvent — unknown event type (EC004)', () => {
  it('WHEN payload type is not in SUBSCRIPTION_EVENT_TYPES THEN returns unknown AND recordEvent is called with null subscriptionId AND updateSubscriptionStatus is NOT called', async () => {
    const repo = makeMockRepo();

    const payload = {
      type: 'subscription.upgraded',
      data: {},
    };

    const outcome = await dispatchMobbexSubscriptionEvent(payload, repo);

    expect(outcome).toBe('unknown');
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
    const recordCall = (repo.recordEvent as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(recordCall.subscriptionId).toBeNull();
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [logPayload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(logPayload.outcome).toBe('unknown');
  });
});

// T016 — orphan subscription records event with null subscriptionId

describe('dispatchMobbexSubscriptionEvent — orphan subscription (EC003, R008)', () => {
  it('WHEN updateSubscriptionStatus returns orphan THEN returns orphan AND recordEvent is called with subscriptionId null', async () => {
    const repo = makeMockRepo({
      updateSubscriptionStatus: jest.fn().mockResolvedValue({ outcome: 'orphan', subscriptionId: null, resolvedStatus: null }),
    });

    const payload = {
      type: 'subscription.activated',
      data: { subscription_id: 'psub-nonexistent' },
    };

    const outcome = await dispatchMobbexSubscriptionEvent(payload, repo);

    expect(outcome).toBe('orphan');
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
    const recordCall = (repo.recordEvent as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(recordCall.subscriptionId).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [logPayload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(logPayload.outcome).toBe('orphan');
  });
});

// T017 — successful dispatch calls recordEvent and emits NF002 log

describe('dispatchMobbexSubscriptionEvent — successful dispatch (R008, R011, NF002)', () => {
  it('WHEN a known event is dispatched and updateSubscriptionStatus returns applied THEN recordEvent is called with subscriptionId and NF002 log is emitted', async () => {
    const repo = makeMockRepo({
      updateSubscriptionStatus: jest.fn().mockResolvedValue({ outcome: 'applied', subscriptionId: 'sub-001', resolvedStatus: 'pending' }),
    });

    const payload = {
      type: 'subscription.activated',
      data: {
        subscription_id: 'psub-1',
        event_id: 'evt-001',
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
      },
    };

    const outcome = await dispatchMobbexSubscriptionEvent(payload, repo);

    expect(outcome).toBe('applied');
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
    const recordCall = (repo.recordEvent as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(recordCall.subscriptionId).toBe('sub-001');
    expect(recordCall.eventId).toBe('evt-001');

    expect(mockLogger.info).toHaveBeenCalled();
    const infoLog = mockLogger.info.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).outcome === 'applied',
    ) as [Record<string, unknown>] | undefined;
    expect(infoLog).toBeDefined();
    const logPayload = infoLog![0];
    expect(logPayload.event_type).toBe('subscription.activated');
    expect(logPayload.provider_subscription_id).toBe('psub-1');
    expect(logPayload.subscription_id).toBe('sub-001');
    expect(logPayload.outcome).toBe('applied');
  });

  it('WHEN updateSubscriptionStatus returns noop THEN recordEvent is still called and logger.warn is emitted with outcome noop', async () => {
    const repo = makeMockRepo({
      updateSubscriptionStatus: jest.fn().mockResolvedValue({ outcome: 'noop', subscriptionId: 'sub-001', resolvedStatus: 'active' }),
    });

    const payload = {
      type: 'subscription.activated',
      data: { subscription_id: 'psub-1' },
    };

    const outcome = await dispatchMobbexSubscriptionEvent(payload, repo);

    expect(outcome).toBe('noop');
    expect(repo.recordEvent).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [logPayload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(logPayload.outcome).toBe('noop');
  });
});
