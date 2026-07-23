import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { SqsEmailNotifier } from '../../../../../src/modules/notifications/providers/sqsEmailNotifier.js';
import { ValidationError } from '../../../../../src/shared/errors.js';
import type { EmailTemplateId } from '../../../../../src/modules/notifications/templates/emailTemplateRegistry.js';

function makeMockSqsClient() {
  return { send: jest.fn().mockResolvedValue({ MessageId: 'msg-1' }) };
}

describe('SqsEmailNotifier.send', () => {
  it('WHEN called THEN it issues one SendMessageCommand with the envelope and resolves without any delivery call (R003)', async () => {
    const sqsClient = makeMockSqsClient();
    const notifier = new SqsEmailNotifier(sqsClient as never, 'https://sqs.example/queue');

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
    const notifier = new SqsEmailNotifier(sqsClient as never, 'https://sqs.example/queue');

    await expect(
      notifier.send('not-a-real-template' as EmailTemplateId, {} as never, { to: 'ada@example.com' }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(sqsClient.send).not.toHaveBeenCalled();
  });
});
