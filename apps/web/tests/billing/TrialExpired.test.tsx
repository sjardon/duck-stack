import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SubscriptionPlan } from '@repo/types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../src/hooks/use-billing', () => ({
  usePlans: vi.fn(),
  useSubscribe: vi.fn(),
}));

vi.mock('../../src/hooks/useTrialStatus', () => ({
  useInvalidateMySubscription: vi.fn(),
}));

import { usePlans, useSubscribe } from '../../src/hooks/use-billing';
import { useInvalidateMySubscription } from '../../src/hooks/useTrialStatus';
import TrialExpiredPage from '../../src/pages/TrialExpired';

const mockUsePlans = usePlans as ReturnType<typeof vi.fn>;
const mockUseSubscribe = useSubscribe as ReturnType<typeof vi.fn>;
const mockUseInvalidate = useInvalidateMySubscription as ReturnType<typeof vi.fn>;

const paidPlan: SubscriptionPlan = {
  id: 'plan-1',
  code: 'pro',
  name: 'Pro Plan',
  description: 'Pro features',
  price: 999,
  currency: 'USD',
  interval: 'month',
  features: ['Feature A'],
  is_active: true,
  provider_plan_id: 'prov-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const freePlan: SubscriptionPlan = {
  id: 'plan-free',
  code: 'free',
  name: 'Free Plan',
  description: 'Free tier',
  price: 0,
  currency: 'USD',
  interval: 'month',
  features: ['Basic access'],
  is_active: true,
  provider_plan_id: 'prov-free',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trial-expired']}>
      <Routes>
        <Route path="/trial-expired" element={<TrialExpiredPage />} />
        <Route path="/" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseInvalidate.mockReturnValue(vi.fn().mockResolvedValue(undefined));
  mockUseSubscribe.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

// T017 — R009, R011, EC005

describe('TrialExpiredPage — renders title and plan list (R009)', () => {
  it('WHEN the page renders THEN the title "Your free trial has ended" is visible', () => {
    mockUsePlans.mockReturnValue({ data: [paidPlan], isLoading: false });

    renderPage();

    expect(screen.getByText('Your free trial has ended')).toBeInTheDocument();
  });

  it('WHEN plans are loaded THEN renders a PlanCard for each plan', () => {
    mockUsePlans.mockReturnValue({ data: [paidPlan], isLoading: false });

    renderPage();

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
  });
});

describe('TrialExpiredPage — no free plan (R011, EC005)', () => {
  it('WHEN plans contain no free plan THEN no "Continue with free" button is present', () => {
    mockUsePlans.mockReturnValue({ data: [paidPlan], isLoading: false });

    renderPage();

    expect(screen.queryByRole('button', { name: /continue with free/i })).not.toBeInTheDocument();
  });

  it('WHEN plans contain no free plan THEN PlanCard is rendered for each paid plan', () => {
    mockUsePlans.mockReturnValue({ data: [paidPlan], isLoading: false });

    renderPage();

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
  });
});

// T018 — R010, R015, EC004

describe('TrialExpiredPage — free plan button (R010)', () => {
  it('WHEN plans contain a plan with code === "free" THEN a "Continue with free" button is rendered', () => {
    mockUsePlans.mockReturnValue({ data: [paidPlan, freePlan], isLoading: false });

    renderPage();

    expect(screen.getByRole('button', { name: /continue with free/i })).toBeInTheDocument();
  });

  it('WHEN "Continue with free" is clicked THEN subscribe mutation is called with planCode: "free"', () => {
    const mockMutate = vi.fn();
    mockUseSubscribe.mockReturnValue({ mutate: mockMutate, isPending: false });
    mockUsePlans.mockReturnValue({ data: [paidPlan, freePlan], isLoading: false });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /continue with free/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      { planCode: 'free' },
      expect.any(Object),
    );
  });

  it('WHEN mutation succeeds THEN invalidateQueries is called with subscriptions/me key and navigate("/") is called (R015, EC004)', () => {
    const mockInvalidate = vi.fn().mockResolvedValue(undefined);
    mockUseInvalidate.mockReturnValue(mockInvalidate);

    const mockMutate = vi.fn().mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    mockUseSubscribe.mockReturnValue({ mutate: mockMutate, isPending: false });
    mockUsePlans.mockReturnValue({ data: [paidPlan, freePlan], isLoading: false });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /continue with free/i }));

    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
