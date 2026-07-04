import { processMessage } from '../../../../src/modules/notifications/worker.js';
import { ProviderError } from '../../../../src/shared/errors.js';
import type { IEmailNotifier } from '../../../../src/modules/notifications/ports/iEmailNotifier.js';
import type { ISqsEmailQueue, SqsEnvelope } from '../../../../src/modules/notifications/ports/iSqsEmailQueue.js';

jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../src/modules/notifications/templates/templateRegistry.js', () => ({
  templateRegistry: {
    'example.welcome_demo': {
      subject: 'Welcome',
      render: jest.fn().mockResolvedValue('<p>Hello Alice</p>'),
    },
  },
}));

const { logger } = jest.requireMock('../../../../src/shared/infrastructure/logger.js');

const validPayload = {
  requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  userId: 'user-001',
  templateId: 'example.welcome_demo',
  to: 'alice@example.com',
  variables: { recipientName: 'Alice' },
  enqueuedAt: '2026-07-03T00:00:00.000Z',
};

const validEnvelope: SqsEnvelope = {
  messageId: 'msg-001',
  receiptHandle: 'receipt-001',
  body: JSON.stringify(validPayload),
};

function makeQueue(overrides: Partial<ISqsEmailQueue> = {}): ISqsEmailQueue {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
    receive: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeNotifier(overrides: Partial<IEmailNotifier> = {}): IEmailNotifier {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T017 — success path
describe('worker — success path (R004, R008, NF001)', () => {
  it('WHEN worker receives a valid message and send() resolves THEN delete() is called and outcome:dispatched is logged', async () => {
    const queue = makeQueue();
    const notifier = makeNotifier();

    await processMessage(validEnvelope, queue, notifier);

    expect(notifier.send).toHaveBeenCalledTimes(1);
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: 'Welcome',
        html: expect.any(String),
      }),
    );

    expect(queue.delete).toHaveBeenCalledTimes(1);
    expect(queue.delete).toHaveBeenCalledWith('receipt-001');

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: validPayload.requestId,
        templateId: validPayload.templateId,
        outcome: 'dispatched',
        duration: expect.any(Number),
      }),
      expect.any(String),
    );

    // NF001 — rendered HTML must not appear in log fields
    const logCalls = (logger.info as jest.Mock).mock.calls;
    const loggedStr = JSON.stringify(logCalls);
    expect(loggedStr).not.toContain('<p>');
  });
});

// T018 — transient ProviderError leaves message unacknowledged
describe('worker — transient ProviderError (R005, NF002, EC002)', () => {
  it('WHEN send() throws ProviderError(502) THEN delete() is NOT called and outcome:retry is logged', async () => {
    const queue = makeQueue();
    const notifier = makeNotifier({
      send: jest.fn().mockRejectedValue(new ProviderError('SES transient error', 502)),
    });

    await processMessage(validEnvelope, queue, notifier);

    expect(queue.delete).not.toHaveBeenCalled();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: validPayload.requestId,
        templateId: validPayload.templateId,
        outcome: 'retry',
      }),
      expect.any(String),
    );
  });
});

// T019 — permanent ProviderError deletes message
describe('worker — permanent ProviderError (EC003)', () => {
  it('WHEN send() throws ProviderError(400) THEN delete() IS called and outcome:permanent_failure is logged', async () => {
    const queue = makeQueue();
    const notifier = makeNotifier({
      send: jest.fn().mockRejectedValue(new ProviderError('SES permanent error', 400)),
    });

    await processMessage(validEnvelope, queue, notifier);

    expect(queue.delete).toHaveBeenCalledTimes(1);
    expect(queue.delete).toHaveBeenCalledWith('receipt-001');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: validEnvelope.messageId,
        outcome: 'permanent_failure',
      }),
      expect.any(String),
    );
  });
});

// T020 — poison message (parse failure) deletes without retry
describe('worker — poison message (EC001)', () => {
  it('WHEN receive() returns a message with malformed JSON THEN the message is deleted, no render is attempted, and outcome:parse_error is logged', async () => {
    const poisonEnvelope: SqsEnvelope = {
      messageId: 'msg-poison',
      receiptHandle: 'receipt-poison',
      body: 'NOT_VALID_JSON{{{{',
    };

    const queue = makeQueue();
    const notifier = makeNotifier();

    await processMessage(poisonEnvelope, queue, notifier);

    expect(notifier.send).not.toHaveBeenCalled();
    expect(queue.delete).toHaveBeenCalledTimes(1);
    expect(queue.delete).toHaveBeenCalledWith('receipt-poison');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'msg-poison',
        outcome: 'parse_error',
        duration: expect.any(Number),
      }),
      expect.any(String),
    );
  });

  it('WHEN receive() returns a message with a valid JSON body that fails schema validation THEN the message is deleted and outcome:parse_error is logged', async () => {
    const invalidSchemaEnvelope: SqsEnvelope = {
      messageId: 'msg-schema-fail',
      receiptHandle: 'receipt-schema-fail',
      // Missing required fields
      body: JSON.stringify({ foo: 'bar' }),
    };

    const queue = makeQueue();
    const notifier = makeNotifier();

    await processMessage(invalidSchemaEnvelope, queue, notifier);

    expect(notifier.send).not.toHaveBeenCalled();
    expect(queue.delete).toHaveBeenCalledTimes(1);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'msg-schema-fail',
        outcome: 'parse_error',
        duration: expect.any(Number),
      }),
      expect.any(String),
    );
  });
});
