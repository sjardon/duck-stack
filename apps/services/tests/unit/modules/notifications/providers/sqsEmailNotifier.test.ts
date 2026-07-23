import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { SqsEmailNotifier } from '../../../../../src/modules/notifications/providers/sqsEmailNotifier.js';
import { EmailSendMessageSchema } from '../../../../../src/modules/notifications/dtos/emailSendMessageSchema.js';
import { ValidationError } from '../../../../../src/shared/errors.js';
import type { EmailTemplateId } from '../../../../../src/modules/notifications/templates/emailTemplateRegistry.js';

function makeMockSqsClient() {
  return { send: jest.fn().mockResolvedValue({ MessageId: 'msg-1' }) };
}

function makeMockRepository() {
  return {
    createQueued: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
    recordProviderMessageId: jest.fn(),
    markSent: jest.fn(),
    applyDeliveryEventByProviderMessageId: jest.fn(),
  };
}

describe('SqsEmailNotifier.send', () => {
  it('WHEN called THEN it issues one SendMessageCommand with the envelope and resolves without any delivery call (R003)', async () => {
    const sqsClient = makeMockSqsClient();
    const repository = makeMockRepository();
    const notifier = new SqsEmailNotifier(sqsClient as never, 'https://sqs.example/queue', repository as never);

    const variables = { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' };
    await notifier.send('example.ping', variables, { to: 'ada@example.com' });

    expect(sqsClient.send).toHaveBeenCalledTimes(1);
    const command = sqsClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input.QueueUrl).toBe('https://sqs.example/queue');

    const envelope = JSON.parse(command.input.MessageBody as string);
    expect(envelope).toMatchObject({
      templateId: 'example.ping',
      variables,
      to: 'ada@example.com',
    });
    expect(typeof envelope.requestId).toBe('string');
  });

  it('WHEN called with an unknown template id THEN it throws ValidationError and never calls SQSClient.send (R008)', async () => {
    const sqsClient = makeMockSqsClient();
    const repository = makeMockRepository();
    const notifier = new SqsEmailNotifier(sqsClient as never, 'https://sqs.example/queue', repository as never);

    await expect(
      notifier.send('not-a-real-template' as EmailTemplateId, {} as never, { to: 'ada@example.com' }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sqsClient.send).not.toHaveBeenCalled();
  });
});

// T012 — R001: EmailSendMessage carries sendId
describe('EmailSendMessageSchema — sendId', () => {
  const baseEnvelope = {
    requestId: 'req-1',
    templateId: 'example.ping',
    variables: { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
    to: 'ada@example.com',
  };

  it('WHEN sendId is missing THEN safeParse fails', () => {
    const result = EmailSendMessageSchema.safeParse(baseEnvelope);
    expect(result.success).toBe(false);
  });

  it('WHEN sendId is present THEN safeParse succeeds', () => {
    const result = EmailSendMessageSchema.safeParse({ ...baseEnvelope, sendId: 'send-001' });
    expect(result.success).toBe(true);
  });
});

// T014 — R001, NF003: send() persists a queued record before enqueueing
describe('SqsEmailNotifier.send — persistence before enqueue (R001, NF003)', () => {
  it('WHEN called THEN createQueued is awaited and resolves before SendMessageCommand is issued, and the enqueued sendId matches the id passed to createQueued', async () => {
    const callOrder: string[] = [];
    const repository = makeMockRepository();
    repository.createQueued.mockImplementation(async () => {
      callOrder.push('createQueued');
    });
    const sqsClient = {
      send: jest.fn().mockImplementation(async () => {
        callOrder.push('SendMessageCommand');
        return { MessageId: 'msg-1' };
      }),
    };

    const notifier = new SqsEmailNotifier(sqsClient as never, 'https://sqs.example/queue', repository as never);
    const variables = { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' };

    await notifier.send('example.ping', variables, { to: 'ada@example.com' });

    expect(callOrder).toEqual(['createQueued', 'SendMessageCommand']);

    const createQueuedArg = repository.createQueued.mock.calls[0][0] as { id: string };
    const command = sqsClient.send.mock.calls[0][0];
    const envelope = JSON.parse(command.input.MessageBody as string);
    expect(envelope.sendId).toBe(createQueuedArg.id);
  });
});

// T015 — R001: send() does not enqueue when persistence fails
describe('SqsEmailNotifier.send — persistence failure aborts enqueue (R001)', () => {
  it('WHEN createQueued rejects THEN send() rejects and SQSClient.send is never called', async () => {
    const repository = makeMockRepository();
    repository.createQueued.mockRejectedValue(new Error('db unavailable'));
    const sqsClient = makeMockSqsClient();

    const notifier = new SqsEmailNotifier(sqsClient as never, 'https://sqs.example/queue', repository as never);

    await expect(
      notifier.send(
        'example.ping',
        { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
        { to: 'ada@example.com' },
      ),
    ).rejects.toThrow();

    expect(sqsClient.send).not.toHaveBeenCalled();
  });
});
