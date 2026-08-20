import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    get_distinct_id: vi.fn(() => null),
  },
}));

import posthog from 'posthog-js';
import { listPlans } from '../src/api/plans';
import Pricing from '../src/components/sections/Pricing';

const mockCapture = posthog.capture as ReturnType<typeof vi.fn>;

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
  vi.clearAllMocks();
  localStorage.clear();
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

// T017 — R003, NF001, NF002
describe('Pricing CTA — conversion event recorded synchronously before navigation, no PII', () => {
  it("(R003, NF001, NF002) clicking a plan CTA calls captureEvent('registration_started', ...) before window.location.href is set, with only action/plan in the payload", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockPlans }),
    }));
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      configurable: true,
      writable: true,
    });
    mockCapture.mockImplementation(() => {
      expect(window.location.href).toBe('');
    });

    render(<Pricing />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [name, properties] = mockCapture.mock.calls[0];
    expect(name).toBe('registration_started');
    expect(properties).toEqual({ action: 'pricing', plan: 'pro' });
    expect(window.location.href).toBe('http://web.test/billing/subscribe?plan=pro');
  });
});

// T019 — R008, EC004
describe('Pricing CTA — repeat hand-off from the same browser does not record a second conversion', () => {
  it('(R008, EC004) clicking the same plan CTA twice records registration_started only once, while navigation happens on both clicks', async () => {
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
    const button = screen.getByRole('button', { name: /get started/i });

    fireEvent.click(button);
    expect(window.location.href).toBe('http://web.test/billing/subscribe?plan=pro');

    window.location.href = '';
    fireEvent.click(button);

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('http://web.test/billing/subscribe?plan=pro');
  });
});
