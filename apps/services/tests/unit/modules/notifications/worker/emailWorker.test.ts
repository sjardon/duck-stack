import { DeleteMessageCommand, SendMessageCommand, type Message, type SQSClient } from '@aws-sdk/client-sqs';
import { ProviderError } from '../../../../../src/shared/errors.js';
import { notificationsConfig } from '../../../../../src/shared/configs/notificationsConfig.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';

const mockExecute = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({})),
  SendEmailCommand: jest.fn(),
}));

jest.mock('../../../../../src/modules/notifications/providers/sesEmailSender.js', () => ({
  SesEmailSender: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../../src/modules/notifications/useCases/deliverEmailUseCase.js', () => ({
  DeliverEmailUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

import { processMessage } from '../../../../../src/modules/notifications/worker/emailWorker.js';

notificationsConfig.emailQueueUrl = 'https://sqs.example/queue';
notificationsConfig.emailDeadLetterQueueUrl = 'https://sqs.example/dlq';

function makeSqsClient(): SQSClient {
  return { send: jest.fn().mockResolvedValue({}) } as unknown as SQSClient;
}

function makeRawMessage(body: string): Message {
  return { MessageId: 'msg-1', ReceiptHandle: 'receipt-1', Body: body };
}

const validEnvelope = {
  requestId: 'req-1',
  templateId: 'example.ping',
  variables: { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
  to: 'ada@example.com',
  userId: 'user-1',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('processMessage — malformed message (T021, EC001)', () => {
  it('WHEN the body fails schema validation THEN it deletes the message, never calls DeliverEmailUseCase, and logs the error', async () => {
    const sqsClient = makeSqsClient();
    const errorSpy = jest.spyOn(logger, 'error');

    await processMessage(sqsClient, makeRawMessage('{ not valid json'));

    expect(mockExecute).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(sqsClient.send).toHaveBeenCalledTimes(1);
    const command = (sqsClient.send as jest.Mock).mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteMessageCommand);
  });
});

describe('processMessage — successful delivery (T022, R007, NF001, R009)', () => {
  it('WHEN delivery of the example.ping example template succeeds end to end THEN it logs {requestId, userId, templateId, result: "sent", duration} without variables/html/subject, and deletes the message (R009)', async () => {
    mockExecute.mockResolvedValue(undefined);
    const sqsClient = makeSqsClient();
    const infoSpy = jest.spyOn(logger, 'info');

    await processMessage(sqsClient, makeRawMessage(JSON.stringify(validEnvelope)));

    expect(mockExecute).toHaveBeenCalledTimes(1);

    const loggedFields = infoSpy.mock.calls.find((call) => (call[0] as Record<string, unknown>)?.result === 'sent')?.[0] as Record<string, unknown>;
    expect(loggedFields).toMatchObject({
      requestId: 'req-1',
      userId: 'user-1',
      templateId: 'example.ping',
      result: 'sent',
    });
    expect(typeof loggedFields.duration).toBe('number');
    expect(loggedFields).not.toHaveProperty('variables');
    expect(loggedFields).not.toHaveProperty('html');
    expect(loggedFields).not.toHaveProperty('subject');

    expect(sqsClient.send).toHaveBeenCalledTimes(1);
    const command = (sqsClient.send as jest.Mock).mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteMessageCommand);
  });
});

describe('processMessage — transient failure (T023, R005, R007, NF002)', () => {
  it('WHEN delivery throws ProviderError(502) THEN it logs a warn-level transient_failure line and never deletes the message', async () => {
    mockExecute.mockRejectedValue(new ProviderError('down', 502));
    const sqsClient = makeSqsClient();
    const warnSpy = jest.spyOn(logger, 'warn');

    await processMessage(sqsClient, makeRawMessage(JSON.stringify(validEnvelope)));

    const loggedFields = warnSpy.mock.calls.find((call) => (call[0] as Record<string, unknown>)?.result === 'transient_failure')?.[0] as Record<string, unknown>;
    expect(loggedFields).toMatchObject({
      requestId: 'req-1',
      userId: 'user-1',
      templateId: 'example.ping',
      result: 'transient_failure',
    });
    expect(typeof loggedFields.duration).toBe('number');

    expect(sqsClient.send).not.toHaveBeenCalled();
  });
});

describe('processMessage — permanent failure (T024, R006, R007, NF001, NF002)', () => {
  it('WHEN delivery throws ProviderError(400) THEN it forwards to the DLQ, deletes from the source queue, and logs a permanent_failure line', async () => {
    mockExecute.mockRejectedValue(new ProviderError('rejected', 400));
    const sqsClient = makeSqsClient();
    const errorSpy = jest.spyOn(logger, 'error');

    await processMessage(sqsClient, makeRawMessage(JSON.stringify(validEnvelope)));

    const loggedFields = errorSpy.mock.calls.find((call) => (call[0] as Record<string, unknown>)?.result === 'permanent_failure')?.[0] as Record<string, unknown>;
    expect(loggedFields).toMatchObject({
      requestId: 'req-1',
      userId: 'user-1',
      templateId: 'example.ping',
      result: 'permanent_failure',
    });
    expect(loggedFields).not.toHaveProperty('variables');
    expect(loggedFields).not.toHaveProperty('html');

    expect(sqsClient.send).toHaveBeenCalledTimes(2);
    const dlqCommand = (sqsClient.send as jest.Mock).mock.calls[0][0];
    expect(dlqCommand).toBeInstanceOf(SendMessageCommand);
    expect(dlqCommand.input.QueueUrl).toBe('https://sqs.example/dlq');

    const deleteCommand = (sqsClient.send as jest.Mock).mock.calls[1][0];
    expect(deleteCommand).toBeInstanceOf(DeleteMessageCommand);
    expect(deleteCommand.input.QueueUrl).toBe('https://sqs.example/queue');
  });
});
