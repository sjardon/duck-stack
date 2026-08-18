import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@sentry/react', () => ({
  setUser: vi.fn(),
}));

vi.mock('../../src/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import { useCurrentUser } from '../../src/hooks/use-current-user';
import { useSyncErrorTrackingUser } from '../../src/hooks/use-sync-error-tracking-user';

const mockSetUser = Sentry.setUser as ReturnType<typeof vi.fn>;
const mockUseCurrentUser = useCurrentUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T019 — R006

describe('useSyncErrorTrackingUser — authenticated attribution (R006)', () => {
  it('WHEN useCurrentUser returns a signed-in user THEN Sentry.setUser is called with { id } only', () => {
    mockUseCurrentUser.mockReturnValue({
      id: 'user-1',
      firstName: 'Jane',
      emailAddresses: [{ emailAddress: 'jane@example.com' }],
    });

    renderHook(() => useSyncErrorTrackingUser());

    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(mockSetUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.anything() }),
    );
  });
});

// T020 — EC005

describe('useSyncErrorTrackingUser — unauthenticated attribution is cleared, not skipped (EC005)', () => {
  it('WHEN useCurrentUser returns null THEN Sentry.setUser is called with null rather than not called at all', () => {
    mockUseCurrentUser.mockReturnValue(null);

    renderHook(() => useSyncErrorTrackingUser());

    expect(mockSetUser).toHaveBeenCalledWith(null);
  });
});
