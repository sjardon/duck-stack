import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi.fn((options: unknown) => ({ name: 'mock-sentry-vite-plugin', options })),
}));

const ENV_KEYS = [
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_URL',
  'VITE_RELEASE',
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  vi.unstubAllEnvs();
});

// T021 — R003, NF001, EC001, EC005

describe('vite.config — sourcemaps and plugin gated on SENTRY_AUTH_TOKEN (R003, NF001, EC001, EC005)', () => {
  it('WHEN SENTRY_AUTH_TOKEN is set THEN build.sourcemap is true and a sentry-vite-plugin entry is included with filesToDeleteAfterUpload, no errorHandler override, and deploy-only credentials sourced from process.env keys that are never VITE_-prefixed', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'token-123';
    process.env.SENTRY_ORG = 'my-org';
    process.env.SENTRY_PROJECT = 'my-project';
    process.env.SENTRY_URL = 'https://sentry.example.test';
    process.env.VITE_RELEASE = 'v1.0.0';

    const { sentryVitePlugin } = await import('@sentry/vite-plugin');
    const mockSentryVitePlugin = sentryVitePlugin as ReturnType<typeof vi.fn>;

    const config = (await import('../../vite.config')).default;

    expect(config.build.sourcemap).toBe(true);
    expect(mockSentryVitePlugin).toHaveBeenCalledTimes(1);

    const options = mockSentryVitePlugin.mock.calls[0][0];
    expect(options.sourcemaps.filesToDeleteAfterUpload).toEqual(['**/*.map']);
    expect(options.errorHandler).toBeUndefined();

    expect(options.authToken).toBe('token-123');
    expect(options.org).toBe('my-org');
    expect(options.project).toBe('my-project');
    expect(options.url).toBe('https://sentry.example.test');

    for (const key of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_URL']) {
      expect(key.startsWith('VITE_')).toBe(false);
      expect(`VITE_${key}` in process.env).toBe(false);
    }

    const pluginEntries = (config.plugins as unknown[]).flat().filter(Boolean) as Array<{
      name?: string;
    }>;
    expect(pluginEntries.some((plugin) => plugin?.name === 'mock-sentry-vite-plugin')).toBe(true);
  });

  it('WHEN SENTRY_AUTH_TOKEN is unset THEN build.sourcemap is false and no sentry-vite-plugin entry is included', async () => {
    const { sentryVitePlugin } = await import('@sentry/vite-plugin');
    const mockSentryVitePlugin = sentryVitePlugin as ReturnType<typeof vi.fn>;

    const config = (await import('../../vite.config')).default;

    expect(config.build.sourcemap).toBe(false);
    expect(mockSentryVitePlugin).not.toHaveBeenCalled();

    const pluginEntries = (config.plugins as unknown[]).flat().filter(Boolean) as Array<{
      name?: string;
    }>;
    expect(pluginEntries.some((plugin) => plugin?.name === 'mock-sentry-vite-plugin')).toBe(
      false,
    );
  });
});

// T023 — R005, EC002

describe('vite.config — release identifier matches between build and runtime (R005, EC002)', () => {
  it('WHEN VITE_RELEASE is set THEN release.name passed to sentryVitePlugin reads the same VITE_RELEASE value used by errorTracking.ts at runtime', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'token-123';
    process.env.SENTRY_ORG = 'my-org';
    process.env.SENTRY_PROJECT = 'my-project';
    process.env.VITE_RELEASE = 'v2.5.0';

    const { sentryVitePlugin } = await import('@sentry/vite-plugin');
    const mockSentryVitePlugin = sentryVitePlugin as ReturnType<typeof vi.fn>;

    await import('../../vite.config');

    const options = mockSentryVitePlugin.mock.calls[0][0];
    expect(options.release).toEqual({ name: 'v2.5.0' });

    vi.stubEnv('VITE_ERROR_TRACKING_DSN', 'https://dsn.example/1');
    vi.stubEnv('VITE_RELEASE', 'v2.5.0');

    const { readErrorTrackingConfig } = await import('../../src/lib/errorTracking');

    expect(readErrorTrackingConfig()?.release).toBe(options.release.name);
  });
});
