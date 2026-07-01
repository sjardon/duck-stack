import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return { apiFetch: vi.fn(), ApiError };
});

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
}));

import { apiFetch } from '../../src/api/client';
import { getMyQuotas } from '../../src/api/billing';
import { useAuth } from '@clerk/clerk-react';
import { useQuota, useInvalidateQuotas } from '../../src/hooks/useQuota';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeSharedWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ getToken: vi.fn().mockResolvedValue('token-abc') });
});

// T001 — R011: getMyQuotas API function
describe('getMyQuotas', () => {
  it('WHEN called THEN apiFetch is invoked with /billing/quotas/me and { token }', async () => {
    const quotas = [
      {
        name: 'api_calls',
        count: 10,
        soft_limit: 80,
        hard_limit: 100,
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
        state: 'normal',
      },
    ];
    mockApiFetch.mockResolvedValue({ quotas });

    const result = await getMyQuotas('token-abc');

    expect(mockApiFetch).toHaveBeenCalledWith('/billing/quotas/me', { token: 'token-abc' });
    expect(result).toEqual(quotas);
  });
});

// T003 — R001, R003: useQuota returns entry fields and isLoading: false after fetch
describe('useQuota — returns matching entry fields (R001, R003)', () => {
  it('WHEN useQuota mounts and fetch resolves with a matching entry THEN returns correct fields and isLoading: false', async () => {
    const entry = {
      name: 'api_calls',
      count: 42,
      soft_limit: 80,
      hard_limit: 100,
      period_start: '2026-06-01T00:00:00Z',
      period_end: '2026-07-01T00:00:00Z',
      state: 'normal' as const,
    };
    mockApiFetch.mockResolvedValue({ quotas: [entry] });

    const { result } = renderHook(() => useQuota('api_calls'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.count).toBe(42);
    expect(result.current.soft_limit).toBe(80);
    expect(result.current.hard_limit).toBe(100);
    expect(result.current.state).toBe('normal');
    expect(result.current.period_end).toBe('2026-07-01T00:00:00Z');
    expect(result.current.isLoading).toBe(false);
  });
});

// T004 — R002: useQuota returns normal defaults when name absent
describe('useQuota — returns normal defaults when name absent (R002)', () => {
  it('WHEN the response contains no entry for the requested name THEN state = normal and hard_limit = Infinity', async () => {
    mockApiFetch.mockResolvedValue({ quotas: [] });

    const { result } = renderHook(() => useQuota('storage_gb'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.state).toBe('normal');
    expect(result.current.hard_limit).toBe(Infinity);
  });
});

// T005 — R001, EC001: useQuota returns normal while loading
describe('useQuota — returns normal state while loading (R001, EC001)', () => {
  it('WHEN useQuota is rendered before the initial fetch resolves THEN isLoading = true and state = normal', async () => {
    let resolvePromise!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockApiFetch.mockReturnValue(pending);

    const { result } = renderHook(() => useQuota('api_calls'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.state).toBe('normal');

    // Resolve to avoid hanging
    resolvePromise({ quotas: [] });
  });
});

// T006 — NF001: useQuota shares a single cache entry across instances
describe('useQuota — shares a single cache entry (NF001)', () => {
  it('WHEN two instances of useQuota with different names are mounted simultaneously THEN apiFetch is called exactly once', async () => {
    const quotas = [
      {
        name: 'api_calls',
        count: 5,
        soft_limit: 80,
        hard_limit: 100,
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
        state: 'normal' as const,
      },
      {
        name: 'storage_gb',
        count: 2,
        soft_limit: 8,
        hard_limit: 10,
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
        state: 'normal' as const,
      },
    ];
    mockApiFetch.mockResolvedValue({ quotas });

    const wrapper = makeSharedWrapper();

    const { result: result1 } = renderHook(() => useQuota('api_calls'), { wrapper });
    const { result: result2 } = renderHook(() => useQuota('storage_gb'), { wrapper });

    await waitFor(() => expect(result1.current.isLoading).toBe(false));
    await waitFor(() => expect(result2.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/billing/quotas/me', expect.objectContaining({ token: 'token-abc' }));
  });
});

// NF002: useQuota configures refetchOnWindowFocus in the React Query call
describe('useQuota — refetchOnWindowFocus is enabled (NF002)', () => {
  it('WHEN useQuota mounts THEN the query for getMyQuotas is configured with refetchOnWindowFocus: true', async () => {
    const quotas = [
      {
        name: 'api_calls',
        count: 1,
        soft_limit: 80,
        hard_limit: 100,
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
        state: 'normal' as const,
      },
    ];
    mockApiFetch.mockResolvedValue({ quotas });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useQuota('api_calls'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const query = queryClient.getQueryCache().find({ queryKey: ['billing', 'quotas', 'me'] });
    expect(query).toBeDefined();
    // refetchOnWindowFocus is true when set explicitly on the query options
    expect(query?.options.refetchOnWindowFocus).toBe(true);
  });
});

// EC002: useQuota handles free-subscription lazy creation transparently
describe('useQuota — handles lazy free subscription creation (EC002)', () => {
  it('WHEN GET /billing/quotas/me returns a valid QuotaUsage[] for a new free-plan user THEN useQuota returns the entry without extra branching', async () => {
    const quotas = [
      {
        name: 'api_calls',
        count: 0,
        soft_limit: 80,
        hard_limit: 100,
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
        state: 'normal' as const,
      },
    ];
    mockApiFetch.mockResolvedValue({ quotas });

    const { result } = renderHook(() => useQuota('api_calls'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.count).toBe(0);
    expect(result.current.state).toBe('normal');
    expect(result.current.soft_limit).toBe(80);
    expect(result.current.hard_limit).toBe(100);
    expect(result.current.period_end).toBe('2026-07-01T00:00:00Z');
    expect(result.current.isLoading).toBe(false);
  });
});

// EC004: useQuota passes through period_end verbatim without local recomputation
describe('useQuota — passes through period_end verbatim (EC004)', () => {
  it('WHEN the API returns a quota with an already-elapsed period_end THEN useQuota returns that period_end value unchanged', async () => {
    const stalePeriodEnd = '2026-01-01T00:00:00Z'; // a past date
    const quotas = [
      {
        name: 'api_calls',
        count: 50,
        soft_limit: 80,
        hard_limit: 100,
        period_start: '2025-12-01T00:00:00Z',
        period_end: stalePeriodEnd,
        state: 'soft_exceeded' as const,
      },
    ];
    mockApiFetch.mockResolvedValue({ quotas });

    const { result } = renderHook(() => useQuota('api_calls'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.period_end).toBe(stalePeriodEnd);
    expect(result.current.state).toBe('soft_exceeded');
  });
});

// T008 — R010, EC005: useInvalidateQuotas invalidates the quota cache key
describe('useInvalidateQuotas — invalidates cache key (R010, EC005)', () => {
  it('WHEN the function returned by useInvalidateQuotas is called THEN queryClient.invalidateQueries is invoked with the quotas key', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useInvalidateQuotas(), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['billing', 'quotas', 'me'] });
  });
});
