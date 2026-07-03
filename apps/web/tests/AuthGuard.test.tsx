import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthGuard from '../src/components/auth/AuthGuard';

// Mock @clerk/clerk-react
vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
}));

// Mock use-user-profile hook
vi.mock('../src/hooks/use-user-profile', () => ({
  useUserProfile: vi.fn(),
}));

// Mock useTrialStatus so AuthGuard does not need a QueryClient
vi.mock('../src/hooks/useTrialStatus', () => ({
  useTrialStatus: vi.fn(),
}));

import { useAuth } from '@clerk/clerk-react';
import { useUserProfile } from '../src/hooks/use-user-profile';
import { useTrialStatus } from '../src/hooks/useTrialStatus';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseUserProfile = useUserProfile as ReturnType<typeof vi.fn>;
const mockUseTrialStatus = useTrialStatus as ReturnType<typeof vi.fn>;

function renderWithRouter(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/sign-in" element={<div>Sign In Page</div>} />
        <Route path="/onboarding" element={<AuthGuard />}>
          <Route index element={<div>Onboarding Page</div>} />
        </Route>
        <Route element={<AuthGuard />}>
          <Route path="/" element={<div>Dashboard Page</div>} />
          <Route path="/profile" element={<div>Profile Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: trial not loading, not expired — neutral state
  mockUseTrialStatus.mockReturnValue({
    isTrialing: false,
    isExpired: false,
    daysRemaining: null,
    trialEndsAt: null,
    isLoading: false,
  });
});

describe('AuthGuard — onboarding redirect logic', () => {
  it('(EC009) redirects unauthenticated user to /sign-in before evaluating onboarding flag', () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    mockUseUserProfile.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderWithRouter('/profile');

    expect(screen.getByText('Sign In Page')).toBeInTheDocument();
    expect(screen.queryByText('Profile Page')).not.toBeInTheDocument();
  });

  it('(R007, NF002) redirects authenticated user with onboarding_completed=false to /onboarding', () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseUserProfile.mockReturnValue({
      data: {
        name: 'Alice',
        email: 'alice@example.com',
        avatar_url: null,
        locale: null,
        timezone: null,
        job_role: null,
        company_size: null,
        primary_use_case: null,
        onboarding_completed: false,
      },
      isLoading: false,
      isError: false,
    });

    renderWithRouter('/profile');

    expect(screen.getByText('Onboarding Page')).toBeInTheDocument();
    expect(screen.queryByText('Profile Page')).not.toBeInTheDocument();
  });

  it('(R008) redirects authenticated user with onboarding_completed=true away from /onboarding to /', () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseUserProfile.mockReturnValue({
      data: {
        name: 'Alice',
        email: 'alice@example.com',
        avatar_url: null,
        locale: null,
        timezone: null,
        job_role: 'Engineer',
        company_size: '11-50',
        primary_use_case: 'Build tools',
        onboarding_completed: true,
      },
      isLoading: false,
      isError: false,
    });

    renderWithRouter('/onboarding');

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding Page')).not.toBeInTheDocument();
  });

  it('(EC007) renders loading state while profile is loading, no redirect', () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseUserProfile.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithRouter('/profile');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Profile Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Onboarding Page')).not.toBeInTheDocument();
  });

  it('(EC008) renders neutral state when profile has an error, no redirect to /onboarding', () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseUserProfile.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithRouter('/profile');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding Page')).not.toBeInTheDocument();
  });
});
