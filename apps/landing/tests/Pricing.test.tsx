import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { listPlans } from '../src/api/plans';
import Pricing from '../src/components/sections/Pricing';

const mockPlans = [
  {
    code: 'pro',
    name: 'Pro Plan',
    price: 1999,
    currency: 'USD',
    interval: 'month' as const,
    features: ['Feature A', 'Feature B'],
  },
];

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  vi.stubEnv('VITE_WEB_URL', 'http://web.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// T001
describe('listPlans', () => {
  it('fetches GET /billing/plans using VITE_API_URL and returns LandingPlan[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockPlans }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listPlans();

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/billing/plans');
    expect(result).toEqual(mockPlans);
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    await expect(listPlans()).rejects.toThrow();
  });
});

// T003
describe('Pricing section', () => {
  it('(R001) renders a card per plan showing name, price, interval, features, and CTA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockPlans }),
    }));

    render(<Pricing />);

    await waitFor(() => expect(screen.getByText('Pro Plan')).toBeInTheDocument());
    expect(screen.getByText(/\$1,999/)).toBeInTheDocument();
    expect(screen.getByText(/month/i)).toBeInTheDocument();
    expect(screen.getByText('Feature A')).toBeInTheDocument();
    expect(screen.getByText('Feature B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('(EC006) renders "No plans available" empty state when listPlans returns []', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    }));

    render(<Pricing />);

    await waitFor(() =>
      expect(screen.getByText(/no plans available/i)).toBeInTheDocument(),
    );
  });

  it('(NF002) renders a non-blocking error message with a Retry button on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<Pricing />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument(),
    );
  });
});

// T004
describe('Pricing CTA navigation', () => {
  it('(R002) clicking a plan CTA sets window.location.href to the web origin with plan code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockPlans }),
    }));
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      configurable: true,
      writable: true,
    });

    render(<Pricing />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(window.location.href).toBe('http://web.test/billing/subscribe?plan=pro');
  });
});
