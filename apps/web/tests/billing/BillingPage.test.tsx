import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SubscriptionPlan, Subscription } from '@repo/types';
import StatusBadge from '../../src/components/domain/billing/StatusBadge';
import PlanCard from '../../src/components/domain/billing/PlanCard';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../src/hooks/use-billing', () => ({
  useMySubscription: vi.fn(),
  usePlans: vi.fn(),
  useCancelSubscription: vi.fn(),
}));

import { useMySubscription, usePlans, useCancelSubscription } from '../../src/hooks/use-billing';
import BillingPage from '../../src/pages/billing/BillingPage';

const mockUseMySubscription = useMySubscription as ReturnType<typeof vi.fn>;
const mockUsePlans = usePlans as ReturnType<typeof vi.fn>;
const mockUseCancelSubscription = useCancelSubscription as ReturnType<typeof vi.fn>;

const mockPlan: SubscriptionPlan = {
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

const mockSub: Subscription = {
  id: 'sub-1',
  user_id: 'user-1',
  org_id: null,
  plan_id: 'plan-1',
  provider: 'mobbex',
  provider_subscription_id: 'prov-sub-1',
  status: 'active',
  current_period_start: '2026-06-01T00:00:00Z',
  current_period_end: '2026-07-01T00:00:00Z',
  cancel_at_period_end: false,
  canceled_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const defaultSubQuery = { isLoading: false, isError: false, data: null, refetch: vi.fn() };
const defaultPlansQuery = { isLoading: false, isError: false, data: [], refetch: vi.fn() };
const defaultCancelMutation = { mutate: vi.fn(), isPending: false };

function renderPage() {
  return render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  );
}

// T012 — StatusBadge
describe('StatusBadge', () => {
  it('(R008) renders yellow badge for pending', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('pending')).toHaveAttribute('data-status', 'pending');
  });

  it('(R008) renders green badge for active', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toHaveAttribute('data-status', 'active');
  });

  it('(R008) renders red badge for past_due', () => {
    render(<StatusBadge status="past_due" />);
    expect(screen.getByText('past_due')).toHaveAttribute('data-status', 'past_due');
  });

  it('(R008) renders grey badge for canceled', () => {
    render(<StatusBadge status="canceled" />);
    expect(screen.getByText('canceled')).toHaveAttribute('data-status', 'canceled');
  });
});

// T014 — PlanCard
describe('PlanCard', () => {
  it('renders plan name, formatted price, interval, and features', () => {
    render(<PlanCard plan={mockPlan} onSelect={vi.fn()} />);

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.getByText(/\$999/)).toBeInTheDocument();
    expect(screen.getByText(/month/i)).toBeInTheDocument();
    expect(screen.getByText('Feature A')).toBeInTheDocument();
  });

  it('(NF001) disables the CTA button when loading=true', () => {
    render(<PlanCard plan={mockPlan} onSelect={vi.fn()} loading={true} />);

    expect(screen.getByRole('button', { name: /get started/i })).toBeDisabled();
  });

  it('calls onSelect with plan code when CTA is clicked', () => {
    const mockOnSelect = vi.fn();
    render(<PlanCard plan={mockPlan} onSelect={mockOnSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(mockOnSelect).toHaveBeenCalledWith('pro');
  });
});

// T016 — BillingPage
describe('BillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_LANDING_URL', 'http://landing.test');
    vi.stubEnv('VITE_PROVIDER_PORTAL_URL', 'https://portal.test');
    mockUseCancelSubscription.mockReturnValue(defaultCancelMutation);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('(R005) renders plan name, StatusBadge, and formatted current_period_end when subscription is active', () => {
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: mockSub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [mockPlan] });

    renderPage();

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText(/2026-07-01/)).toBeInTheDocument();
  });

  it('(R006) renders free-plan empty state and pricing CTA when subscription is null', () => {
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: null });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [] });

    renderPage();

    expect(screen.getByText(/free plan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view pricing/i })).toBeInTheDocument();
  });

  it('(R007) clicking Cancel opens the confirmation dialog', () => {
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: mockSub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [mockPlan] });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('(R009) dismissing the dialog does not call the cancel mutation', () => {
    const mockCancel = vi.fn();
    mockUseCancelSubscription.mockReturnValue({ mutate: mockCancel, isPending: false });
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: mockSub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [mockPlan] });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(mockCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('(R007) confirming the dialog calls cancel mutation with atPeriodEnd: true', () => {
    const mockCancel = vi.fn();
    mockUseCancelSubscription.mockReturnValue({ mutate: mockCancel, isPending: false });
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: mockSub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [mockPlan] });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockCancel).toHaveBeenCalledWith(
      { id: 'sub-1', body: { atPeriodEnd: true } },
      expect.any(Object),
    );
  });

  it('(EC001) renders past_due badge and payment-failed message', () => {
    const pastDueSub = { ...mockSub, status: 'past_due' as const };
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: pastDueSub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [mockPlan] });

    renderPage();

    expect(screen.getByText('past_due')).toBeInTheDocument();
    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
  });

  it('(EC002) renders canceled badge with end-date line and hides the Cancel button', () => {
    const canceledSub = { ...mockSub, status: 'canceled' as const };
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: canceledSub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [mockPlan] });

    renderPage();

    expect(screen.getByText('canceled')).toBeInTheDocument();
    expect(screen.getByText(/Canceled — access ends/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancel$/i })).not.toBeInTheDocument();
  });

  it('(EC003) renders plan_id with legacy plan label when plan is not found in catalog', () => {
    const legacySub = { ...mockSub, plan_id: 'legacy-plan-id' };
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, data: legacySub });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery, data: [] });

    renderPage();

    expect(screen.getByText(/legacy-plan-id.*legacy plan/i)).toBeInTheDocument();
  });

  it('(NF002) renders non-blocking error message with Retry button when query fails', () => {
    mockUseMySubscription.mockReturnValue({ ...defaultSubQuery, isError: true, data: undefined });
    mockUsePlans.mockReturnValue({ ...defaultPlansQuery });

    renderPage();

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
