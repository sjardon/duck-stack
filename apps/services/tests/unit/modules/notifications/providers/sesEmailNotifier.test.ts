// Mock the static logger so we can spy on its methods (NF003: assert only templateId/err are logged)
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock renderEmailTemplate so tests control rendering output independently of R002.
jest.mock('../../../../../src/modules/notifications/templates/renderEmailTemplate.js', () => ({
  renderEmailTemplate: jest.fn(),
}));

// Mock the SES v2 SDK — no real network calls, no real credentials required.
const mockSesSend = jest.fn();
jest.mock(
  '@aws-sdk/client-sesv2',
  () => ({
    SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
    SendEmailCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  }),
  { virtual: true },
);

import { SesEmailNotifier } from '../../../../../src/modules/notifications/providers/sesEmailNotifier.js';
import { renderEmailTemplate } from '../../../../../src/modules/notifications/templates/renderEmailTemplate.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { SendEmailInput } from '@repo/types';

const mockRenderEmailTemplate = renderEmailTemplate as jest.Mock;
const mockLogger = logger as unknown as { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
const MockSendEmailCommand = SendEmailCommand as unknown as jest.Mock;

const SENDER_EMAIL = 'noreply@example.com';

/** Lets already-queued microtasks (e.g. an un-awaited `dispatch()` chain) settle. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeNotifier(): SesEmailNotifier {
  return new SesEmailNotifier({ region: 'us-east-1', senderEmail: SENDER_EMAIL });
}

const welcomeInput: SendEmailInput<'welcome'> = {
  templateId: 'welcome',
  to: 'user@example.com',
  context: { recipientName: 'Ada' },
};

beforeEach(() => {
  jest.clearAllMocks();
});

// T006 — R001, NF001
describe('SesEmailNotifier.send — non-blocking (R001, NF001)', () => {
  it('WHEN send() is called with a valid template/context THEN it returns undefined synchronously without waiting for the provider call to settle', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    // Deferred/never-resolved provider mock — proves send() does not await delivery.
    mockSesSend.mockReturnValue(new Promise<never>(() => {}));

    const notifier = makeNotifier();
    const result = notifier.send(welcomeInput);

    expect(result).toBeUndefined();

    // Even after pending microtasks are given a chance to run, nothing about the
    // never-resolving provider promise should surface back through send().
    await flushPromises();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

// T014 — R003
describe('SesEmailNotifier — delivers via SES (R003)', () => {
  it('WHEN send() is called with a valid template/context/recipient THEN SESv2Client.send is called once with a SendEmailCommand built from the rendered output and configured sender', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    mockSesSend.mockResolvedValue({ MessageId: 'msg-1' });

    const notifier = makeNotifier();
    notifier.send(welcomeInput);

    await flushPromises();

    expect(mockSesSend).toHaveBeenCalledTimes(1);
    expect(MockSendEmailCommand).toHaveBeenCalledTimes(1);
    const commandInput = MockSendEmailCommand.mock.calls[0]?.[0] as {
      FromEmailAddress: string;
      Destination: { ToAddresses: string[] };
      Content: { Simple: { Subject: { Data: string }; Body: { Html: { Data: string }; Text: { Data: string } } } };
    };
    expect(commandInput.FromEmailAddress).toBe(SENDER_EMAIL);
    expect(commandInput.Destination.ToAddresses).toEqual(['user@example.com']);
    expect(commandInput.Content.Simple.Subject.Data).toBe('Welcome');
    expect(commandInput.Content.Simple.Body.Html.Data).toBe('<p>Hi Ada</p>');
    expect(commandInput.Content.Simple.Body.Text.Data).toBe('Hi Ada');
  });
});

// T019 — R004, EC001, NF003
describe('SesEmailNotifier — unregistered template id (R004, EC001, NF003)', () => {
  it('WHEN send() is called with an unregistered templateId THEN logger.warn is called with only the template id, SESv2Client.send is never called, and send() does not throw', async () => {
    mockRenderEmailTemplate.mockResolvedValue(undefined);

    const notifier = makeNotifier();

    expect(() =>
      notifier.send({
        templateId: 'unknown-template' as unknown as 'welcome',
        to: 'user@example.com',
        context: { recipientName: 'Ada' },
      }),
    ).not.toThrow();

    await flushPromises();

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload['templateId']).toBe('unknown-template');
    expect(payload).not.toHaveProperty('to');
    expect(payload).not.toHaveProperty('context');
    expect(mockSesSend).not.toHaveBeenCalled();
  });
});

// T022 — EC002
describe('SesEmailNotifier — malformed or missing recipient (EC002)', () => {
  it.each(['', 'not-an-email', 'missing-at-sign.com'])(
    'WHEN send() is called with recipient %p THEN logger.warn is called, SESv2Client.send is never called, and send() does not throw',
    async (to) => {
      mockRenderEmailTemplate.mockResolvedValue({
        subject: 'Welcome',
        html: '<p>Hi Ada</p>',
        text: 'Hi Ada',
      });

      const notifier = makeNotifier();

      expect(() =>
        notifier.send({ templateId: 'welcome', to, context: { recipientName: 'Ada' } }),
      ).not.toThrow();

      await flushPromises();

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockSesSend).not.toHaveBeenCalled();
    },
  );
});

// T024 — R005, EC003, NF002, NF003
describe('SesEmailNotifier — delivery failure isolation (R005, EC003, NF002, NF003)', () => {
  it('WHEN the mocked SESv2Client.send rejects THEN logger.error is called with only the original error and templateId (no PII), and no rejection is observable from send()', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    const sesError = new Error('SES throttled');
    mockSesSend.mockRejectedValue(sesError);

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    const notifier = makeNotifier();

    expect(() => notifier.send(welcomeInput)).not.toThrow();

    await flushPromises();
    process.off('unhandledRejection', onUnhandledRejection);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload['err']).toBe(sesError);
    expect(payload['templateId']).toBe('welcome');
    expect(payload).not.toHaveProperty('to');
    expect(payload).not.toHaveProperty('context');
    expect(unhandledRejections).toHaveLength(0);
  });
});

// T027 — EC004
describe('SesEmailNotifier — compile-time context enforcement (EC004)', () => {
  it('WHEN a consumer invokes send() with an incomplete context THEN it is rejected by the TypeScript compiler', () => {
    const notifier = makeNotifier();

    // @ts-expect-error — 'welcome' requires { recipientName: string }; {} is missing that field.
    notifier.send({ templateId: 'welcome', to: 'user@example.com', context: {} });
  });
});
