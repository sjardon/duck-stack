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

import App from '../../src/App';
import { useSyncErrorTrackingUser } from '../../src/hooks/use-sync-error-tracking-user';

const mockUseSyncErrorTrackingUser = useSyncErrorTrackingUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T025 — R006

describe('App — syncs error-tracking user (R006)', () => {
  it('WHEN App renders THEN useSyncErrorTrackingUser is invoked', () => {
    render(<App />);

    expect(mockUseSyncErrorTrackingUser).toHaveBeenCalledTimes(1);
  });
});
