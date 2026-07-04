import { SesEmailNotifier } from '../../../../../src/modules/notifications/adapters/sesEmailNotifier.js';
import { ProviderError } from '../../../../../src/shared/errors.js';
import type { NotificationsConfig } from '../../../../../src/shared/configs/notificationsConfig.js';

jest.mock('@aws-sdk/client-sesv2');

const { SESv2Client, SendEmailCommand } = jest.requireMock('@aws-sdk/client-sesv2');

const testConfig: NotificationsConfig = {
  sesRegion: 'us-east-1',
  sesFromAddress: 'noreply@example.com',
  sqsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/test-queue',
  sqsDlqUrl: 'https://sqs.us-east-1.amazonaws.com/123/test-dlq',
  sqsPollingIntervalMs: 5000,
  sqsMaxMessages: 10,
  sqsVisibilityTimeoutSec: 60,
};

const sendParams = {
  to: 'alice@example.com',
  subject: 'Test Subject',
  html: '<p>Hello</p>',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SesEmailNotifier — transient SES error (R004, R005, EC002)', () => {
  it('WHEN SES returns a 5xx error THEN send() throws ProviderError with statusCode 502', async () => {
    const transientError = Object.assign(new Error('ServiceUnavailable'), {
      name: 'ServiceUnavailableException',
      $metadata: { httpStatusCode: 503 },
    });

    const mockSend = jest.fn().mockRejectedValue(transientError);
    SESv2Client.mockImplementation(() => ({ send: mockSend }));

    const notifier = new SesEmailNotifier(testConfig);

    await expect(notifier.send(sendParams)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      statusCode: 502,
    });
  });

  it('WHEN SES returns a timeout error THEN send() throws ProviderError with statusCode 502', async () => {
    const timeoutError = Object.assign(new Error('Request timeout'), {
      name: 'TimeoutError',
    });

    const mockSend = jest.fn().mockRejectedValue(timeoutError);
    SESv2Client.mockImplementation(() => ({ send: mockSend }));

    const notifier = new SesEmailNotifier(testConfig);

    await expect(notifier.send(sendParams)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      statusCode: 502,
    });
  });
});

describe('SesEmailNotifier — permanent SES error (EC003)', () => {
  it('WHEN SES returns an invalid-address error THEN send() throws ProviderError with statusCode 400', async () => {
    const permanentError = Object.assign(new Error('Invalid address'), {
      name: 'MessageRejected',
      $metadata: { httpStatusCode: 400 },
    });

    const mockSend = jest.fn().mockRejectedValue(permanentError);
    SESv2Client.mockImplementation(() => ({ send: mockSend }));

    const notifier = new SesEmailNotifier(testConfig);

    await expect(notifier.send(sendParams)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      statusCode: 400,
    });
  });

  it('WHEN SES returns a MailFromDomainNotVerified error THEN send() throws ProviderError with statusCode 400', async () => {
    const permanentError = Object.assign(new Error('Mail from domain not verified'), {
      name: 'MailFromDomainNotVerifiedException',
      $metadata: { httpStatusCode: 400 },
    });

    const mockSend = jest.fn().mockRejectedValue(permanentError);
    SESv2Client.mockImplementation(() => ({ send: mockSend }));

    const notifier = new SesEmailNotifier(testConfig);

    await expect(notifier.send(sendParams)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      statusCode: 400,
    });
  });
});

describe('SesEmailNotifier — successful send (R004)', () => {
  it('WHEN SES accepts the email THEN send() resolves without error', async () => {
    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-001' });
    SESv2Client.mockImplementation(() => ({ send: mockSend }));

    const notifier = new SesEmailNotifier(testConfig);

    await expect(notifier.send(sendParams)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ['alice@example.com'] },
        Content: {
          Simple: {
            Subject: { Data: 'Test Subject', Charset: 'UTF-8' },
            Body: { Html: { Data: '<p>Hello</p>', Charset: 'UTF-8' } },
          },
        },
        FromEmailAddress: 'noreply@example.com',
      }),
    );
  });
});
