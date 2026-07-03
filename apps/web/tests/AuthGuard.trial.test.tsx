import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthGuard from '../src/components/auth/AuthGuard';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../src/hooks/use-user-profile', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('../src/hooks/useTrialStatus', () => ({
  useTrialStatus: vi.fn(),
}));

import { useAuth } from '@clerk/clerk-react';
import { useUserProfile } from '../src/hooks/use-user-profile';
import { useTrialStatus } from '../src/hooks/useTrialStatus';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseUserProfile = useUserProfile as ReturnType<typeof vi.fn>;
const mockUseTrialStatus = useTrialStatus as ReturnType<typeof vi.fn>;

const defaultAuthState = { isLoaded: true, isSignedIn: true };
const defaultProfileState = {
  data: {
    name: 'Alice',
    email: 'alice@example.com',
    avatar_url: null,
    locale: null,
    timezone: null,
    job_role: null,
    company_size: null,
    primary_use_case: null,
    onboarding_completed: true,
  },
  isLoading: false,
  isError: false,
};
const defaultTrialNotExpired = {
  isTrialing: false,
  isExpired: false,
  daysRemaining: null,
  trialEndsAt: null,
  isLoading: false,
};

function renderWithRouter(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/sign-in" element={<div>Sign In Page</div>} />
        <Route element={<AuthGuard />}>
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          <Route path="/profile" element={<div>Profile Page</div>} />
          <Route path="/billing" element={<div>Billing Page</div>} />
          <Route path="/billing/subscribe" element={<div>Subscribe Page</div>} />
          <Route path="/pricing" element={<div>Pricing Page</div>} />
          <Route path="/trial-expired" element={<div>Trial Expired Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// T011 — R012, R013, EC001, EC002

describe('AuthGuard — trial redirect logic (R012)', () => {
  it('WHEN isExpired === true and path is /dashboard THEN renders a redirect to /trial-expired', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: true,
      daysRemaining: null,
      trialEndsAt: '2026-06-01T00:00:00Z',
      isLoading: false,
    });

    renderWithRouter('/dashboard');

    expect(screen.getByText('Trial Expired Page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
  });

  it('WHEN isExpired === true and path is /profile THEN renders a redirect to /trial-expired', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: true,
      daysRemaining: null,
      trialEndsAt: '2026-06-01T00:00:00Z',
      isLoading: false,
    });

    renderWithRouter('/profile');

    expect(screen.getByText('Trial Expired Page')).toBeInTheDocument();
    expect(screen.queryByText('Profile Page')).not.toBeInTheDocument();
  });
});

describe('AuthGuard — trial whitelist (R013)', () => {
  it('WHEN isExpired === true and path is /billing THEN renders <Outlet /> without redirecting', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: true,
      daysRemaining: null,
      trialEndsAt: '2026-06-01T00:00:00Z',
      isLoading: false,
    });

    renderWithRouter('/billing');

    expect(screen.getByText('Billing Page')).toBeInTheDocument();
    expect(screen.queryByText('Trial Expired Page')).not.toBeInTheDocument();
  });

  it('WHEN isExpired === true and path is /pricing THEN renders <Outlet /> without redirecting', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: true,
      daysRemaining: null,
      trialEndsAt: '2026-06-01T00:00:00Z',
      isLoading: false,
    });

    renderWithRouter('/pricing');

    expect(screen.getByText('Pricing Page')).toBeInTheDocument();
    expect(screen.queryByText('Trial Expired Page')).not.toBeInTheDocument();
  });

  it('WHEN isExpired === true and path is /billing/subscribe THEN renders <Outlet /> without redirecting', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: true,
      daysRemaining: null,
      trialEndsAt: '2026-06-01T00:00:00Z',
      isLoading: false,
    });

    renderWithRouter('/billing/subscribe');

    expect(screen.getByText('Subscribe Page')).toBeInTheDocument();
    expect(screen.queryByText('Trial Expired Page')).not.toBeInTheDocument();
  });

  it('WHEN isExpired === true and path is /trial-expired THEN renders <Outlet /> without redirecting', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: true,
      daysRemaining: null,
      trialEndsAt: '2026-06-01T00:00:00Z',
      isLoading: false,
    });

    renderWithRouter('/trial-expired');

    expect(screen.getByText('Trial Expired Page')).toBeInTheDocument();
  });
});

describe('AuthGuard — trial loading state (EC001)', () => {
  it('WHEN isLoading === true (trial) THEN renders loading state without redirecting to /trial-expired', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: false,
      daysRemaining: null,
      trialEndsAt: null,
      isLoading: true,
    });

    renderWithRouter('/dashboard');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Trial Expired Page')).not.toBeInTheDocument();
  });
});

describe('AuthGuard — trial not expired (EC002)', () => {
  it('WHEN isExpired === false THEN renders <Outlet /> normally', () => {
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockUseUserProfile.mockReturnValue(defaultProfileState);
    mockUseTrialStatus.mockReturnValue(defaultTrialNotExpired);

    renderWithRouter('/dashboard');

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    expect(screen.queryByText('Trial Expired Page')).not.toBeInTheDocument();
  });
});
