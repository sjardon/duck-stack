// Mock the static logger so we can spy on its methods (NF003: assert only templateId/err are logged)
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock renderEmailTemplate so tests control rendering output independently of R003.
jest.mock('../../../../../src/modules/notifications/templates/renderEmailTemplate.js', () => ({
  renderEmailTemplate: jest.fn(),
}));

// Mock the Resend SDK — no real network calls, no real API key required.
const mockResendSend = jest.fn();
jest.mock(
  'resend',
  () => ({
    Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
  }),
  { virtual: true },
);

import { ResendEmailNotifier } from '../../../../../src/modules/notifications/providers/resendEmailNotifier.js';
import { renderEmailTemplate } from '../../../../../src/modules/notifications/templates/renderEmailTemplate.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';
import type { EmailNotifier, SendEmailInput } from '@repo/types';

const mockRenderEmailTemplate = renderEmailTemplate as jest.Mock;
const mockLogger = logger as unknown as { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

const SENDER_EMAIL = 'noreply@example.com';
const API_KEY = 're_test_key';

/** Lets already-queued microtasks (e.g. an un-awaited `dispatch()` chain) settle. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeNotifier(): ResendEmailNotifier {
  return new ResendEmailNotifier({ apiKey: API_KEY, senderEmail: SENDER_EMAIL });
}

const welcomeInput: SendEmailInput<'welcome'> = {
  templateId: 'welcome',
  to: 'user@example.com',
  context: { recipientName: 'Ada' },
};

beforeEach(() => {
  jest.clearAllMocks();
});

// T004 — R001, NF001
describe('ResendEmailNotifier.send — non-blocking (R001, NF001)', () => {
  it('WHEN send() is called with a valid template/context THEN it returns undefined synchronously without waiting for the provider call to settle', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    // Deferred/never-resolved provider mock — proves send() does not await delivery.
    mockResendSend.mockReturnValue(new Promise<never>(() => {}));

    const notifier = makeNotifier();
    const result = notifier.send(welcomeInput);

    expect(result).toBeUndefined();

    // Even after pending microtasks are given a chance to run, nothing about the
    // never-resolving provider promise should surface back through send().
    await flushPromises();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

// T006 — R003, EC005
describe('ResendEmailNotifier — delivers via Resend with both HTML and text (R003, EC005)', () => {
  it('WHEN send() is called with a valid template/context/recipient THEN Resend.emails.send is called once with { from, to, subject, html, text } matching the rendered output', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    mockResendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const notifier = makeNotifier();
    notifier.send(welcomeInput);

    await flushPromises();

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const payload = mockResendSend.mock.calls[0]?.[0] as {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    };
    expect(payload.from).toBe(SENDER_EMAIL);
    expect(payload.to).toEqual(['user@example.com']);
    expect(payload.subject).toBe('Welcome');
    expect(payload.html).toBe('<p>Hi Ada</p>');
    expect(payload.text).toBe('Hi Ada');
  });
});

// T008 — R004, EC001, NF003
describe('ResendEmailNotifier — unregistered template id (R004, EC001, NF003)', () => {
  it('WHEN send() is called with an unregistered templateId THEN logger.warn is called with only the template id, Resend.emails.send is never called, and send() does not throw', async () => {
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
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

// T010 — R003
describe('ResendEmailNotifier — malformed or missing recipient (R003)', () => {
  it.each(['', 'not-an-email', 'missing-at-sign.com'])(
    'WHEN send() is called with recipient %p THEN logger.warn is called, Resend.emails.send is never called, and send() does not throw',
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
      expect(mockResendSend).not.toHaveBeenCalled();
    },
  );
});

// T012 — R005, EC001, EC003, NF002, NF003
describe('ResendEmailNotifier — Resend-returned error object is logged and isolated (R005, EC001, EC003, NF002, NF003)', () => {
  it.each([
    { name: 'rate_limit_exceeded', message: 'Too many requests' },
    { name: 'validation_error', message: 'Sender domain is not verified' },
  ])(
    'WHEN Resend.emails.send resolves with { data: null, error: %j } THEN logger.error is called with { templateId, err } and no rejection is observable',
    async (resendError) => {
      mockRenderEmailTemplate.mockResolvedValue({
        subject: 'Welcome',
        html: '<p>Hi Ada</p>',
        text: 'Hi Ada',
      });
      mockResendSend.mockResolvedValue({ data: null, error: resendError });

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
      expect(payload['templateId']).toBe('welcome');
      expect(payload['err']).toMatchObject(resendError);
      expect(payload).not.toHaveProperty('to');
      expect(payload).not.toHaveProperty('context');
      expect(unhandledRejections).toHaveLength(0);
    },
  );
});

// T013 — R005, EC002, NF002, NF003
describe('ResendEmailNotifier — Resend network-level rejection is logged and isolated (R005, EC002, NF002, NF003)', () => {
  it('WHEN the mocked Resend.emails.send rejects (e.g. invalid API key) THEN logger.error is called with { templateId, err } and no rejection is observable, no retry occurs', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    const resendNetworkError = new Error('Invalid API key');
    mockResendSend.mockRejectedValue(resendNetworkError);

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    const notifier = makeNotifier();

    expect(() => notifier.send(welcomeInput)).not.toThrow();

    await flushPromises();
    process.off('unhandledRejection', onUnhandledRejection);

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload['err']).toBe(resendNetworkError);
    expect(payload['templateId']).toBe('welcome');
    expect(payload).not.toHaveProperty('to');
    expect(payload).not.toHaveProperty('context');
    expect(unhandledRejections).toHaveLength(0);
  });
});

// T020 — R002
describe('ResendEmailNotifier — satisfies the unchanged EmailNotifier port (R002)', () => {
  it('WHEN assigned to the EmailNotifier port type THEN it compiles and send() executes with the exact shape consumer call sites already use', async () => {
    mockRenderEmailTemplate.mockResolvedValue({
      subject: 'Welcome',
      html: '<p>Hi Ada</p>',
      text: 'Hi Ada',
    });
    mockResendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const notifier: EmailNotifier = new ResendEmailNotifier({ apiKey: API_KEY, senderEmail: SENDER_EMAIL });

    expect(() =>
      notifier.send({ templateId: 'welcome', to: 'user@example.com', context: { recipientName: 'Ada' } }),
    ).not.toThrow();

    await flushPromises();

    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });
});
