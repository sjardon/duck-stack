import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import { initErrorTracking, scrubEvent } from '../../src/lib/errorTracking';

const mockInit = Sentry.init as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T001 — R001, R002, R006

describe('initErrorTracking — config gate + init when DSN present (R001, R002, R006)', () => {
  it('WHEN VITE_ERROR_TRACKING_DSN is set THEN Sentry.init is called with that dsn and no integrations/defaultIntegrations override', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    initErrorTracking();

    expect(mockInit).toHaveBeenCalledTimes(1);
    const options = mockInit.mock.calls[0][0];
    expect(options.dsn).toBe('https://dsn.example/1');
    expect(options.integrations).toBeUndefined();
    expect(options.defaultIntegrations).toBeUndefined();
  });
});

// T003 — R007

describe('initErrorTracking — no-op when DSN absent (R007)', () => {
  it('WHEN VITE_ERROR_TRACKING_DSN is absent THEN initErrorTracking returns without calling Sentry.init and without throwing', () => {
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
  it('WHEN Sentry.init throws THEN initErrorTracking does not throw and logs the error instead', () => {
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

// T009 — NF003

describe('scrubEvent / initErrorTracking — report payload never carries a visitor identity (NF003)', () => {
  it('WHEN an event carries a user object THEN scrubEvent returns an event with no user field', () => {
    const eventWithUser = {
      exception: { values: [{ stacktrace: { frames: [] } }] },
      user: { id: 'visitor-1', email: 'visitor@example.com' },
    } as unknown as Parameters<typeof scrubEvent>[0];

    const result = scrubEvent(eventWithUser);

    expect(result.user).toBeUndefined();
  });

  it('Sentry.init is called with sendDefaultPii: false and beforeSend: scrubEvent', () => {
    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');

    initErrorTracking();

    const options = mockInit.mock.calls[0][0];
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend).toBe(scrubEvent);
  });
});
