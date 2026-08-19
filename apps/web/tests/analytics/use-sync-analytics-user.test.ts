import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../src/lib/analytics', () => ({
  posthog: {
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('../../src/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}));

import { posthog } from '../../src/lib/analytics';
import { useCurrentUser } from '../../src/hooks/use-current-user';
import { useSyncAnalyticsUser } from '../../src/hooks/use-sync-analytics-user';

const mockIdentify = posthog.identify as ReturnType<typeof vi.fn>;
const mockReset = posthog.reset as ReturnType<typeof vi.fn>;
const mockUseCurrentUser = useCurrentUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T026 — R003

describe('useSyncAnalyticsUser — identify called with id only on sign-in (R003)', () => {
  it('WHEN useCurrentUser returns a signed-in user THEN posthog.identify is called with user.id and no other argument', () => {
    mockUseCurrentUser.mockReturnValue({
      id: 'user-1',
      firstName: 'Jane',
      emailAddresses: [{ emailAddress: 'jane@example.com' }],
    });

    renderHook(() => useSyncAnalyticsUser());

    expect(mockIdentify).toHaveBeenCalledWith('user-1');
    expect(mockIdentify).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: expect.anything() })
    );
  });
});

// T028 — EC004

describe('useSyncAnalyticsUser — reset called only when a previously-identified user signs out (EC004)', () => {
  it('WHEN a user was previously identified and useCurrentUser then returns null THEN posthog.reset is called', () => {
    mockUseCurrentUser.mockReturnValue({ id: 'user-1' });

    const { rerender } = renderHook(() => useSyncAnalyticsUser());

    expect(mockIdentify).toHaveBeenCalledWith('user-1');

    mockUseCurrentUser.mockReturnValue(null);
    rerender();

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('WHEN the hook mounts with no user and never identified anyone THEN posthog.reset is NOT called', () => {
    mockUseCurrentUser.mockReturnValue(null);

    renderHook(() => useSyncAnalyticsUser());

    expect(mockReset).not.toHaveBeenCalled();
  });
});
