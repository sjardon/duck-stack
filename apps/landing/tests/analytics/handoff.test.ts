import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/analytics', () => ({
  getDistinctId: vi.fn(),
}));

import { getDistinctId } from '../../src/lib/analytics';
import { buildHandoffUrl } from '../../src/lib/handoff';

const mockGetDistinctId = getDistinctId as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_WEB_URL', 'http://web.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T015 — R005, EC001, R010

describe('buildHandoffUrl — carries the distinct id, falls back cleanly when absent (R005, EC001, R010)', () => {
  it('WHEN getDistinctId returns a value THEN landing_id is appended to the resolved URL', () => {
    mockGetDistinctId.mockReturnValue('distinct-abc');

    expect(buildHandoffUrl('/sign-up')).toBe('http://web.test/sign-up?landing_id=distinct-abc');
  });

  it('WHEN the path already carries a query string THEN landing_id is merged into it', () => {
    mockGetDistinctId.mockReturnValue('distinct-abc');

    expect(buildHandoffUrl('/billing/subscribe?plan=pro')).toBe(
      'http://web.test/billing/subscribe?plan=pro&landing_id=distinct-abc',
    );
  });

  it('WHEN getDistinctId returns null THEN the URL is returned unchanged, with no error thrown', () => {
    mockGetDistinctId.mockReturnValue(null);

    expect(() => buildHandoffUrl('/sign-up')).not.toThrow();
    expect(buildHandoffUrl('/sign-up')).toBe('http://web.test/sign-up');
  });
});
