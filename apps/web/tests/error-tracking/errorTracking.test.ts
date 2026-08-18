import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import { initErrorTracking, isThirdPartyError } from '../../src/lib/errorTracking';

const mockInit = Sentry.init as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T001 — R001, R002, R007

describe('initErrorTracking — init when DSN present (R001, R002, R007)', () => {
  it('WHEN VITE_ERROR_TRACKING_DSN is set THEN Sentry.init is called with that dsn and no integrations override', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    initErrorTracking();

    expect(mockInit).toHaveBeenCalledTimes(1);
    const options = mockInit.mock.calls[0][0];
    expect(options.dsn).toBe('https://dsn.example/1');
    expect(options.integrations).toBeUndefined();
    expect(options.defaultIntegrations).toBeUndefined();
  });
});

// T003 — R008

describe('initErrorTracking — no-op when DSN absent (R008)', () => {
  it('WHEN VITE_ERROR_TRACKING_DSN is absent THEN Sentry.init is not called and no error is thrown', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', '');

    expect(() => initErrorTracking()).not.toThrow();
    expect(mockInit).not.toHaveBeenCalled();
  });
});

// T005 — R005

describe('initErrorTracking — environment and release stamped on init (R005)', () => {
  it('WHEN VITE_ENVIRONMENT and VITE_RELEASE are set THEN Sentry.init is called with those values', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');
    vi.stubEnv('VITE_ENVIRONMENT', 'staging');
    vi.stubEnv('VITE_RELEASE', '1.2.3');

    initErrorTracking();

    const options = mockInit.mock.calls[0][0];
    expect(options.environment).toBe('staging');
    expect(options.release).toBe('1.2.3');
  });

  it('WHEN VITE_ENVIRONMENT and VITE_RELEASE are unset THEN Sentry.init defaults to "production" and "unknown"', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');
    vi.stubEnv('VITE_ENVIRONMENT', '');
    vi.stubEnv('VITE_RELEASE', '');

    initErrorTracking();

    const options = mockInit.mock.calls[0][0];
    expect(options.environment).toBe('production');
    expect(options.release).toBe('unknown');
  });
});

// T007 — NF004

describe('initErrorTracking — init failure isolation (NF004)', () => {
  it('WHEN Sentry.init throws THEN initErrorTracking does not throw and logs the error', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');
    mockInit.mockImplementation(() => {
      throw new Error('provider unavailable');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => initErrorTracking()).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

// T009 — EC003

describe('isThirdPartyError — extension/third-party frame detection (EC003)', () => {
  it('WHEN the only stack frame filename starts with an extension scheme THEN it returns true', () => {
    const schemes = [
      'chrome-extension:',
      'moz-extension:',
      'safari-extension:',
      'safari-web-extension:',
    ];

    for (const scheme of schemes) {
      const event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: `${scheme}//abc123/content.js` }],
              },
            },
          ],
        },
      } as unknown as Parameters<typeof isThirdPartyError>[0];

      expect(isThirdPartyError(event)).toBe(true);
    }
  });

  it('WHEN the event has an application-origin frame THEN it returns false', () => {
    const event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'https://app.example.com/assets/index-abc.js' }],
            },
          },
        ],
      },
    } as unknown as Parameters<typeof isThirdPartyError>[0];

    expect(isThirdPartyError(event)).toBe(false);
  });

  it('WHEN Sentry.init is called with beforeSend and the event is third-party THEN beforeSend returns null', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    initErrorTracking();

    const options = mockInit.mock.calls[0][0];
    const thirdPartyEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'chrome-extension://abc123/content.js' }],
            },
          },
        ],
      },
    };

    expect(options.beforeSend(thirdPartyEvent)).toBeNull();
  });
});

// T011 — R006, NF003

describe('initErrorTracking — user PII scrubbing (R006, NF003)', () => {
  it('Sentry.init is called with sendDefaultPii: false', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    initErrorTracking();

    const options = mockInit.mock.calls[0][0];
    expect(options.sendDefaultPii).toBe(false);
  });

  it('WHEN an event carries extra user fields THEN beforeSend strips it down to { id } only', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    initErrorTracking();

    const options = mockInit.mock.calls[0][0];
    const eventWithPii = {
      exception: { values: [{ stacktrace: { frames: [] } }] },
      user: { id: 'user-1', email: 'user@example.com', username: 'someone' },
    };

    const result = options.beforeSend(eventWithPii);

    expect(result.user).toEqual({ id: 'user-1' });
  });
});

// NF002

describe('initErrorTracking — synchronous, non-blocking setup (NF002)', () => {
  it('WHEN initErrorTracking is called THEN it returns synchronously (not a Promise) and Sentry.init has already run before the call returns', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    const result = initErrorTracking();

    expect(result).toBeUndefined();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('WHEN initErrorTracking is called THEN it completes before the next microtask runs, so it never awaits a network round-trip', async () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    const order: string[] = [];
    mockInit.mockImplementation(() => {
      order.push('sentry-init');
    });

    initErrorTracking();
    order.push('call-returned');
    await Promise.resolve();
    order.push('microtask-flushed');

    expect(order).toEqual(['sentry-init', 'call-returned', 'microtask-flushed']);
  });
});
