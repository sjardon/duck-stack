const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

// No explicit return from the mock implementation: when invoked via `new`, the
// constructed `this` (whose prototype is the mock function itself) is what's
// returned, which is what makes `toBeInstanceOf(SentryErrorReporter)` valid.
const mockSentryErrorReporterCtor = jest.fn();
jest.mock('../../../../src/shared/providers/sentryErrorReporter.js', () => ({
  SentryErrorReporter: mockSentryErrorReporterCtor.mockImplementation(function SentryErrorReporterMock(this: { report: jest.Mock }) {
    this.report = jest.fn();
  }),
}));

const mockNoopErrorReporterCtor = jest.fn();
jest.mock('../../../../src/shared/providers/noopErrorReporter.js', () => ({
  NoopErrorReporter: mockNoopErrorReporterCtor.mockImplementation(function NoopErrorReporterMock(this: { report: jest.Mock }) {
    this.report = jest.fn();
  }),
}));

beforeEach(() => {
  jest.resetModules();
  mockLoggerInfo.mockClear();
  mockLoggerError.mockClear();
  mockSentryErrorReporterCtor.mockClear();
  mockNoopErrorReporterCtor.mockClear();
});

// T015 — R007, EC006
describe('createErrorReporter — WHEN errorTrackingConfig.enabled is true (R007)', () => {
  it('returns a SentryErrorReporter instance', async () => {
    jest.doMock('../../../../src/shared/configs/errorTrackingConfig.js', () => ({
      errorTrackingConfig: {
        dsn: 'https://examplePublicKey@o0.ingest.betterstack.com/0',
        enabled: true,
        environment: 'test',
        release: '1.0.0',
        sampleRate: 0.2,
      },
    }));

    const { createErrorReporter } = await import('../../../../src/shared/providers/errorReporter.js');
    const { SentryErrorReporter } = await import('../../../../src/shared/providers/sentryErrorReporter.js');

    const reporter = createErrorReporter();

    expect(reporter).toBeInstanceOf(SentryErrorReporter);
  });
});

// T015 — R008, EC006
describe('createErrorReporter — WHEN errorTrackingConfig.enabled is false (R008, EC006)', () => {
  it('returns a NoopErrorReporter instance and calls logger.info (never logger.error)', async () => {
    jest.doMock('../../../../src/shared/configs/errorTrackingConfig.js', () => ({
      errorTrackingConfig: {
        dsn: '',
        enabled: false,
        environment: 'development',
        release: 'unknown',
        sampleRate: 0.2,
      },
    }));

    const { createErrorReporter } = await import('../../../../src/shared/providers/errorReporter.js');
    const { NoopErrorReporter } = await import('../../../../src/shared/providers/noopErrorReporter.js');

    const reporter = createErrorReporter();

    expect(reporter).toBeInstanceOf(NoopErrorReporter);
    expect(mockLoggerInfo).toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
