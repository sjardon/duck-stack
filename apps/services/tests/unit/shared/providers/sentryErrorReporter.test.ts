// Mock the static logger so we can spy on its methods (NF002: internal SDK failures are logged, not thrown)
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock ErrorOccurrenceSampler so beforeSend's sampling decision is fully controllable per test (EC004).
const mockShouldSend = jest.fn();
jest.mock('../../../../src/shared/providers/errorOccurrenceSampler.js', () => ({
  ErrorOccurrenceSampler: jest.fn().mockImplementation(() => ({ shouldSend: mockShouldSend })),
}));

// Mock the Sentry SDK — @sentry/node is not a runtime dependency yet at this phase (added in T003),
// and even once present, no real network call/init should happen from unit tests.
const mockInit = jest.fn();
const mockCaptureException = jest.fn();
const mockSetTag = jest.fn();
const mockWithScope = jest.fn((callback: (scope: { setTag: jest.Mock }) => void) => {
  callback({ setTag: mockSetTag });
});
jest.mock(
  '@sentry/node',
  () => ({
    init: mockInit,
    withScope: mockWithScope,
    captureException: mockCaptureException,
  }),
  { virtual: true },
);

import { SentryErrorReporter } from '../../../../src/shared/providers/sentryErrorReporter.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';

const mockLogger = logger as unknown as { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

const baseConfig = {
  dsn: 'https://examplePublicKey@o0.ingest.betterstack.com/0',
  enabled: true,
  environment: 'test',
  release: '1.2.3',
  sampleRate: 0.2,
};

function makeReporter(): SentryErrorReporter {
  return new SentryErrorReporter(baseConfig);
}

/** Reads the `beforeSend` callback registered by the constructor via `Sentry.init`. */
function capturedBeforeSend(): (event: Record<string, unknown>) => Record<string, unknown> | null {
  const initOptions = mockInit.mock.calls[0]?.[0] as { beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null };
  return initOptions.beforeSend;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShouldSend.mockReturnValue(true);
});

// T008 — R003, EC005
describe('SentryErrorReporter.report — requestId tagging (R003, EC005)', () => {
  it('WHEN report(error, { requestId }) is called THEN scope.setTag("requestId", requestId) is called before captureException(error)', () => {
    const reporter = makeReporter();
    const error = new Error('boom');
    const callOrder: string[] = [];
    mockSetTag.mockImplementation(() => callOrder.push('setTag'));
    mockCaptureException.mockImplementation(() => callOrder.push('captureException'));

    reporter.report(error, { requestId: 'abc' });

    expect(mockSetTag).toHaveBeenCalledWith('requestId', 'abc');
    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(callOrder).toEqual(['setTag', 'captureException']);
  });

  it('WHEN context.requestId is undefined THEN setTag is never called and captureException still runs', () => {
    const reporter = makeReporter();
    const error = new Error('boom');

    reporter.report(error);

    expect(mockSetTag).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });
});

// T009 — R004, R006
describe('SentryErrorReporter constructor — wires config into Sentry.init (R004, R006)', () => {
  it('WHEN new SentryErrorReporter(config) is constructed THEN Sentry.init is called once with dsn, environment, release from config and sendDefaultPii: false', () => {
    makeReporter();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: baseConfig.dsn,
        environment: baseConfig.environment,
        release: baseConfig.release,
        sendDefaultPii: false,
      }),
    );
  });
});

// T010 — R006, NF003, EC002
describe('SentryErrorReporter beforeSend — strips request/user data (R006, NF003, EC002)', () => {
  it('WHEN beforeSend is invoked with an event containing request/user fields THEN the returned event has both fields removed', () => {
    makeReporter();
    const beforeSend = capturedBeforeSend();

    const event = {
      request: { headers: { authorization: 'Bearer secret' }, data: { password: 'hunter2' } },
      user: { id: 'user-1', email: 'user@example.com' },
      exception: { values: [{ type: 'Error', value: 'boom' }] },
    };

    const result = beforeSend(event);

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('request');
    expect(result).not.toHaveProperty('user');
  });
});

// T011 — EC004, R005
describe('SentryErrorReporter beforeSend — occurrence sampling gate (EC004, R005)', () => {
  it('WHEN the sampler reports the fingerprint as first-seen THEN the event is returned unchanged', () => {
    makeReporter();
    const beforeSend = capturedBeforeSend();
    mockShouldSend.mockReturnValue(true);

    const event = { exception: { values: [{ type: 'Error', value: 'boom' }] } };

    const result = beforeSend(event);

    expect(result).not.toBeNull();
  });

  it('WHEN the sampler reports the fingerprint should be dropped THEN beforeSend returns null', () => {
    makeReporter();
    const beforeSend = capturedBeforeSend();
    mockShouldSend.mockReturnValue(false);

    const event = { exception: { values: [{ type: 'Error', value: 'boom' }] } };

    const result = beforeSend(event);

    expect(result).toBeNull();
  });
});

// T012 — NF002
describe('SentryErrorReporter.report — isolates internal SDK failures (NF002)', () => {
  it('WHEN Sentry.captureException throws synchronously THEN report() does not propagate the throw and logger.error is called', () => {
    const reporter = makeReporter();
    const sdkFailure = new Error('SDK internal failure');
    mockCaptureException.mockImplementation(() => {
      throw sdkFailure;
    });

    expect(() => reporter.report(new Error('boom'))).not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });
});
