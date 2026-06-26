import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../src/hooks/use-billing', () => ({
  useSubscribe: vi.fn(),
  usePlans: vi.fn(),
}));

import { useSubscribe, usePlans } from '../../src/hooks/use-billing';
import SubscribePage from '../../src/pages/billing/SubscribePage';

const mockUseSubscribe = useSubscribe as ReturnType<typeof vi.fn>;
const mockUsePlans = usePlans as ReturnType<typeof vi.fn>;

const mockPlan = {
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

function renderPage(search = '?plan=pro') {
  return render(
    <MemoryRouter initialEntries={[`/billing/subscribe${search}`]}>
      <Routes>
        <Route path="/billing/subscribe" element={<SubscribePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_LANDING_URL', 'http://landing.test');
  mockUsePlans.mockReturnValue({ data: [mockPlan], isLoading: false, isError: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T010
describe('SubscribePage', () => {
  it('(R003) fires subscribe mutation with planCode on mount when ?plan param is present', async () => {
    const mockMutate = vi.fn();
    mockUseSubscribe.mockReturnValue({ mutate: mockMutate, isPending: false, error: null });

    renderPage('?plan=pro');

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { planCode: 'pro' },
        expect.any(Object),
      ),
    );
  });

  it('(R003) redirects to checkoutUrl when subscribe succeeds with checkoutUrl', async () => {
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      configurable: true,
      writable: true,
    });
    const mockMutate = vi.fn().mockImplementation((_vars, opts) => {
      opts?.onSuccess?.({ subscriptionId: 'sub-1', checkoutUrl: 'https://checkout.test' });
    });
    mockUseSubscribe.mockReturnValue({ mutate: mockMutate, isPending: false, error: null });

    renderPage('?plan=pro');

    await waitFor(() => expect(window.location.href).toBe('https://checkout.test'));
  });

  it('(R004) navigates to /billing when subscribe succeeds without checkoutUrl', async () => {
    const mockMutate = vi.fn().mockImplementation((_vars, opts) => {
      opts?.onSuccess?.({ subscriptionId: 'sub-1' });
    });
    mockUseSubscribe.mockReturnValue({ mutate: mockMutate, isPending: false, error: null });

    renderPage('?plan=pro');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/billing'));
  });

  it('(EC004) renders error state and pricing CTA when ?plan param is absent', () => {
    mockUseSubscribe.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });

    renderPage('');

    expect(screen.getByText(/invalid or missing plan/i)).toBeInTheDocument();
    expect(screen.getByText(/view pricing/i)).toBeInTheDocument();
  });

  it('(EC004) renders error state and pricing CTA when backend returns 400', () => {
    const err = Object.assign(new Error('Bad Request'), { status: 400 });
    mockUseSubscribe.mockReturnValue({ mutate: vi.fn(), isPending: false, error: err });

    renderPage('?plan=bad-code');

    expect(screen.getByText(/invalid or missing plan/i)).toBeInTheDocument();
    expect(screen.getByText(/view pricing/i)).toBeInTheDocument();
  });

  it('(EC005) renders already-subscribed message and /billing CTA when backend returns 409', () => {
    const err = Object.assign(new Error('Conflict'), { status: 409 });
    mockUseSubscribe.mockReturnValue({ mutate: vi.fn(), isPending: false, error: err });

    renderPage('?plan=pro');

    expect(screen.getByText(/already.*subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/go to billing/i)).toBeInTheDocument();
  });
});
