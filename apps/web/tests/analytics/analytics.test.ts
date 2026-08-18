import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

import posthog from 'posthog-js';
import { readAnalyticsConfig, initAnalytics, captureEvent } from '../../src/lib/analytics';

const mockInit = posthog.init as ReturnType<typeof vi.fn>;
const mockCapture = posthog.capture as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T001 — R007

describe('initAnalytics — init when key present (R007)', () => {
  it('WHEN VITE_POSTHOG_KEY is set THEN posthog.init is called with that key and a resolved api_host', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://custom.posthog.example');

    initAnalytics();

    expect(mockInit).toHaveBeenCalledTimes(1);
    const [key, options] = mockInit.mock.calls[0];
    expect(key).toBe('phc_test_123');
    expect(options.api_host).toBe('https://custom.posthog.example');
  });

  it('WHEN VITE_POSTHOG_HOST is unset THEN readAnalyticsConfig resolves the documented default host', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');
    vi.stubEnv('VITE_POSTHOG_HOST', '');

    const config = readAnalyticsConfig();

    expect(config).not.toBeNull();
    expect(config?.host).toBe('https://us.i.posthog.com');
  });
});

// T003 — R008

describe('initAnalytics — no-op when key absent (R008)', () => {
  it('WHEN VITE_POSTHOG_KEY is absent THEN initAnalytics returns without calling posthog.init and without throwing', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');

    expect(() => initAnalytics()).not.toThrow();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('WHEN VITE_POSTHOG_KEY is absent THEN readAnalyticsConfig returns null', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');

    expect(readAnalyticsConfig()).toBeNull();
  });
});

// T005 — NF004

describe('initAnalytics — init failure isolation (NF004)', () => {
  it('WHEN the mocked posthog.init throws THEN initAnalytics does not throw and logs the error instead', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');
    mockInit.mockImplementation(() => {
      throw new Error('provider unavailable');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => initAnalytics()).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

// T007 — R001

describe('initAnalytics — automatic screen-view capture configured (R001)', () => {
  it('WHEN initAnalytics runs THEN posthog.init is called with capture_pageview: "history_change"', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');

    initAnalytics();

    const options = mockInit.mock.calls[0][1];
    expect(options.capture_pageview).toBe('history_change');
  });
});

// T009 — R002, NF001

describe('captureEvent — records a named event without blocking (R002, NF001)', () => {
  it('WHEN captureEvent is called THEN it calls the mocked posthog.capture(name, properties) synchronously', () => {
    const result = captureEvent('signup_completed', { plan: 'free' });

    expect(result).toBeUndefined();
    expect(mockCapture).toHaveBeenCalledWith('signup_completed', { plan: 'free' });
  });

  it('WHEN posthog was never initialized THEN captureEvent does not throw (documented no-op)', () => {
    expect(() => captureEvent('signup_completed')).not.toThrow();
  });
});

// T011 — EC005, NF002

describe('initAnalytics — no automatic high-frequency/DOM capture (EC005, NF002)', () => {
  it('WHEN initAnalytics runs THEN posthog.init is called with autocapture: false and capture_heatmaps: false', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');

    initAnalytics();

    const options = mockInit.mock.calls[0][1];
    expect(options.autocapture).toBe(false);
    expect(options.capture_heatmaps).toBe(false);
  });
});

// T013 — R004, NF003, EC003

describe('initAnalytics — session replay masking configured, opt-out per element (R004, NF003, EC003)', () => {
  it('WHEN initAnalytics runs THEN posthog.init is called with maskAllInputs: true and a maskTextSelector', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');

    initAnalytics();

    const options = mockInit.mock.calls[0][1];
    expect(options.session_recording.maskAllInputs).toBe(true);
    expect(options.session_recording.maskTextSelector).toBeDefined();
    expect(typeof options.session_recording.maskTextFn).toBe('function');
  });

  it('WHEN maskTextFn is called on an element without data-ph-allow THEN the text is masked', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');

    initAnalytics();

    const options = mockInit.mock.calls[0][1];
    const element = { dataset: {} } as unknown as HTMLElement;

    expect(options.session_recording.maskTextFn('secret', element)).not.toBe('secret');
  });

  it('WHEN maskTextFn is called on an element with data-ph-allow="true" THEN the original text is returned unchanged', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_123');

    initAnalytics();

    const options = mockInit.mock.calls[0][1];
    const element = { dataset: { phAllow: 'true' } } as unknown as HTMLElement;

    expect(options.session_recording.maskTextFn('secret', element)).toBe('secret');
  });
});
