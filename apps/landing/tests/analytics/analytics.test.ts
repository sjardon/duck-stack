import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    get_distinct_id: vi.fn(),
  },
}));

import posthog from 'posthog-js';
import { initAnalytics, getDistinctId } from '../../src/lib/analytics';

const mockInit = posthog.init as ReturnType<typeof vi.fn>;
const mockGetDistinctId = posthog.get_distinct_id as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T001 — R009, NF001

describe('initAnalytics — init when analytics config present (R009, NF001)', () => {
  it('WHEN VITE_POSTHOG_KEY is set THEN posthog.init is called with the key, api_host, and the documented capture flags', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_landing_123');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://landing.posthog.example');

    initAnalytics();

    expect(mockInit).toHaveBeenCalledTimes(1);
    const [key, options] = mockInit.mock.calls[0];
    expect(key).toBe('phc_landing_123');
    expect(options.api_host).toBe('https://landing.posthog.example');
    expect(options.capture_pageview).toBe(false);
    expect(options.autocapture).toBe(false);
    expect(options.capture_heatmaps).toBe(false);
    expect(options.disable_session_recording).toBe(true);
  });
});

// T003 — R010

describe('initAnalytics / getDistinctId — no-op and no throw when analytics config absent (R010)', () => {
  it('WHEN VITE_POSTHOG_KEY is absent THEN initAnalytics returns without calling posthog.init and without throwing', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');

    expect(() => initAnalytics()).not.toThrow();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('WHEN analytics was never initialized THEN getDistinctId returns null without throwing', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    mockGetDistinctId.mockImplementation(() => {
      throw new Error('not initialized');
    });

    expect(() => getDistinctId()).not.toThrow();
    expect(getDistinctId()).toBeNull();
  });
});

// T010 — R004

describe('getDistinctId — stable and null-safe (R004)', () => {
  it('WHEN posthog.get_distinct_id returns a value THEN getDistinctId returns that same value across repeated calls', () => {
    mockGetDistinctId.mockReturnValue('distinct-abc-123');

    expect(getDistinctId()).toBe('distinct-abc-123');
    expect(getDistinctId()).toBe('distinct-abc-123');
  });

  it('WHEN posthog.get_distinct_id throws THEN getDistinctId returns null', () => {
    mockGetDistinctId.mockImplementation(() => {
      throw new Error('not initialized');
    });

    expect(getDistinctId()).toBeNull();
  });
});
