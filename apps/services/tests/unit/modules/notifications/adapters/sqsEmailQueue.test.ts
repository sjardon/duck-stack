import { SqsEmailQueue } from '../../../../../src/modules/notifications/adapters/sqsEmailQueue.js';
import type { NotificationsConfig } from '../../../../../src/shared/configs/notificationsConfig.js';
import type { EmailSendMessage } from '../../../../../src/modules/notifications/ports/iSqsEmailQueue.js';

jest.mock('@aws-sdk/client-sqs');

const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } =
  jest.requireMock('@aws-sdk/client-sqs');

const testConfig: NotificationsConfig = {
  sesRegion: 'us-east-1',
  sesFromAddress: 'noreply@example.com',
  sqsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/test-queue',
  sqsDlqUrl: 'https://sqs.us-east-1.amazonaws.com/123/test-dlq',
  sqsPollingIntervalMs: 5000,
  sqsMaxMessages: 10,
  sqsVisibilityTimeoutSec: 60,
};

const testMessage: EmailSendMessage = {
  requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  userId: 'user-001',
  templateId: 'example.welcome_demo',
  to: 'alice@example.com',
  variables: { recipientName: 'Alice' },
  enqueuedAt: '2026-07-03T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SqsEmailQueue — enqueue (R003)', () => {
  it('WHEN enqueue() is called THEN SendMessageCommand is sent to the configured queue URL with JSON body', async () => {
    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-001' });
    SQSClient.mockImplementation(() => ({ send: mockSend }));

    const queue = new SqsEmailQueue(testConfig);
    await queue.enqueue(testMessage);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(SendMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        QueueUrl: testConfig.sqsQueueUrl,
        MessageBody: JSON.stringify(testMessage),
      }),
    );
  });
});

describe('SqsEmailQueue — receive (NF002)', () => {
  it('WHEN receive() is called THEN ReceiveMessageCommand uses correct params', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      Messages: [
        {
          MessageId: 'msg-001',
          ReceiptHandle: 'receipt-001',
          Body: JSON.stringify(testMessage),
        },
      ],
    });
    SQSClient.mockImplementation(() => ({ send: mockSend }));

    const queue = new SqsEmailQueue(testConfig);
    const envelopes = await queue.receive();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(ReceiveMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        QueueUrl: testConfig.sqsQueueUrl,
        MaxNumberOfMessages: testConfig.sqsMaxMessages,
        VisibilityTimeout: testConfig.sqsVisibilityTimeoutSec,
        WaitTimeSeconds: expect.any(Number),
      }),
    );
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({
      messageId: 'msg-001',
      receiptHandle: 'receipt-001',
      body: JSON.stringify(testMessage),
    });
  });

  it('WHEN receive() returns no messages THEN an empty array is returned', async () => {
    const mockSend = jest.fn().mockResolvedValue({ Messages: undefined });
    SQSClient.mockImplementation(() => ({ send: mockSend }));

    const queue = new SqsEmailQueue(testConfig);
    const envelopes = await queue.receive();

    expect(envelopes).toEqual([]);
  });
});

describe('SqsEmailQueue — delete (R006)', () => {
  it('WHEN delete() is called THEN DeleteMessageCommand is sent with the given receipt handle', async () => {
    const mockSend = jest.fn().mockResolvedValue({});
    SQSClient.mockImplementation(() => ({ send: mockSend }));

    const queue = new SqsEmailQueue(testConfig);
    await queue.delete('receipt-handle-001');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(DeleteMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        QueueUrl: testConfig.sqsQueueUrl,
        ReceiptHandle: 'receipt-handle-001',
      }),
    );
  });
});
