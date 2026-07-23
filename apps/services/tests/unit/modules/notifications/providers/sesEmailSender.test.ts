// Mock notificationsConfig so the test controls sesConfigurationSetName deterministically
jest.mock('../../../../../src/shared/configs/notificationsConfig.js', () => ({
  notificationsConfig: {
    awsRegion: 'us-east-1',
    emailQueueUrl: 'https://sqs.example/queue',
    emailDeadLetterQueueUrl: 'https://sqs.example/dlq',
    sesFromAddress: 'noreply@example.com',
    sqsPollWaitTimeSeconds: 20,
    sesConfigurationSetName: 'test-configuration-set',
    sesEventsTopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-events',
  },
}));

import { SendEmailCommand } from '@aws-sdk/client-ses';
import { SesEmailSender } from '../../../../../src/modules/notifications/providers/sesEmailSender.js';

function makeMockSesClient(response: unknown) {
  return { send: jest.fn().mockResolvedValue(response) };
}

// T019 — R002: SesEmailSender returns the provider message id
describe('SesEmailSender.send', () => {
  it('WHEN SendEmailCommand resolves with a MessageId THEN send() resolves { providerMessageId } and the command carries ConfigurationSetName', async () => {
    const sesClient = makeMockSesClient({ MessageId: 'abc' });
    const sender = new SesEmailSender(sesClient as never);

    const result = await sender.send({ to: 'ada@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    expect(result).toEqual({ providerMessageId: 'abc' });
    expect(sesClient.send).toHaveBeenCalledTimes(1);
    const command = sesClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input.ConfigurationSetName).toBe('test-configuration-set');
  });
});
