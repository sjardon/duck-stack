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
import { useAuth } from '@clerk/clerk-react';
import { useTrialStatus, useInvalidateMySubscription } from '../../src/hooks/useTrialStatus';

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
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ getToken: vi.fn().mockResolvedValue('token-abc') });
});

// T001 — R001, R002, NF001, NF002, EC001

describe('useTrialStatus — query key and configuration (R001, NF001)', () => {
  it('WHEN useTrialStatus mounts THEN the query is registered with queryKey ["billing","subscriptions","me"]', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'active',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { queryClient, wrapper } = makeSharedWrapper();

    const { result } = renderHook(() => useTrialStatus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const query = queryClient.getQueryCache().find({
      queryKey: ['billing', 'subscriptions', 'me'],
    });
    expect(query).toBeDefined();
    expect(query?.options.staleTime).toBe(60_000);
    expect(query?.options.refetchOnWindowFocus).toBe(true);
  });
});

describe('useTrialStatus — loading state returns safe defaults (EC001)', () => {
  it('WHEN useTrialStatus is rendered before the initial fetch resolves THEN isTrialing=false, isExpired=false, isLoading=true', () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((r) => { resolve = r; });
    mockApiFetch.mockReturnValue(pending);

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isTrialing).toBe(false);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.daysRemaining).toBeNull();
    expect(result.current.trialEndsAt).toBeNull();

    // Resolve to avoid hanging
    resolve({ subscription: null });
  });
});

describe('useTrialStatus — return shape (R002)', () => {
  it('WHEN fetch resolves with an active subscription THEN returns correct shape fields', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'active',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toMatchObject({
      isTrialing: false,
      isExpired: false,
      daysRemaining: null,
      trialEndsAt: null,
      isLoading: false,
    });
  });
});

describe('useTrialStatus — shares a single cache entry with useMySubscription (NF002)', () => {
  it('WHEN two instances of useTrialStatus are mounted simultaneously THEN apiFetch is called exactly once', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'active',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { wrapper } = makeSharedWrapper();

    const { result: result1 } = renderHook(() => useTrialStatus(), { wrapper });
    const { result: result2 } = renderHook(() => useTrialStatus(), { wrapper });

    await waitFor(() => expect(result1.current.isLoading).toBe(false));
    await waitFor(() => expect(result2.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

// T003 — R003, R006, R008, EC007

describe('useTrialStatus — trialing branch (R003)', () => {
  it('WHEN status === "trialing" THEN isTrialing=true, daysRemaining=days_remaining, trialEndsAt=trial_ends_at', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: '2026-07-10T00:00:00Z',
      days_remaining: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTrialing).toBe(true);
    expect(result.current.daysRemaining).toBe(2);
    expect(result.current.trialEndsAt).toBe('2026-07-10T00:00:00Z');
    expect(result.current.isExpired).toBe(false);
  });

  it('WHEN days_remaining === 0 THEN daysRemaining === 0 (EC007)', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: '2026-07-03T23:59:59Z',
      days_remaining: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTrialing).toBe(true);
    expect(result.current.daysRemaining).toBe(0);
  });

  it('WHEN days_remaining === 2 THEN daysRemaining === 2', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: '2026-07-05T00:00:00Z',
      days_remaining: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.daysRemaining).toBe(2);
  });
});

// T005 — R004, EC006

describe('useTrialStatus — expired branch (R004)', () => {
  it('WHEN status === "expired" THEN isExpired=true, isTrialing=false', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'expired',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: '2026-06-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isExpired).toBe(true);
    expect(result.current.isTrialing).toBe(false);
  });

  it('WHEN status === "active" THEN isExpired=false, isTrialing=false (EC006)', async () => {
    const sub = {
      id: 'sub-1',
      user_id: 'user-1',
      org_id: null,
      plan_id: 'plan-1',
      provider: 'test',
      provider_subscription_id: null,
      status: 'active',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({ subscription: sub });

    const { result } = renderHook(() => useTrialStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isExpired).toBe(false);
    expect(result.current.isTrialing).toBe(false);
  });
});

// T007 — R015, EC004

describe('useInvalidateMySubscription — invalidates cache key (R015, EC004)', () => {
  it('WHEN the function returned by useInvalidateMySubscription is called THEN queryClient.invalidateQueries is invoked with the subscriptions/me key', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useInvalidateMySubscription(), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['billing', 'subscriptions', 'me'],
    });
  });
});
