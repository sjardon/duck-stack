import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  RouterProvider: () => null,
}));

vi.mock('../../src/router', () => ({
  router: {},
}));

vi.mock('../../src/hooks/use-sync-error-tracking-user', () => ({
  useSyncErrorTrackingUser: vi.fn(),
}));

vi.mock('../../src/hooks/use-sync-analytics-user', () => ({
  useSyncAnalyticsUser: vi.fn(),
}));

import App from '../../src/App';
import { useSyncAnalyticsUser } from '../../src/hooks/use-sync-analytics-user';

const mockUseSyncAnalyticsUser = useSyncAnalyticsUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T033 — R003

describe('App — syncs analytics user (R003)', () => {
  it('WHEN App renders THEN useSyncAnalyticsUser is invoked', () => {
    render(<App />);

    expect(mockUseSyncAnalyticsUser).toHaveBeenCalledTimes(1);
  });
});
