import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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

import { apiFetch, ApiError } from '../../src/api/client';
import { getMyEntitlements } from '../../src/api/billing';
import { useAuth } from '@clerk/clerk-react';
import { useEntitlement } from '../../src/hooks/use-entitlement';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function makeWrapper() {
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

// T019 — R007: getMyEntitlements API function
describe('getMyEntitlements', () => {
  it('WHEN called THEN apiFetch is invoked with /billing/entitlements/me and the bearer token', async () => {
    mockApiFetch.mockResolvedValue({ entitlements: ['advanced_analytics'] });

    await getMyEntitlements('token-abc');

    expect(mockApiFetch).toHaveBeenCalledWith('/billing/entitlements/me', { token: 'token-abc' });
  });

  it('WHEN the response returns an array THEN the array is returned', async () => {
    const entitlements = ['advanced_analytics', 'api_access'];
    mockApiFetch.mockResolvedValue({ entitlements });

    const result = await getMyEntitlements('token-abc');

    expect(result).toEqual(entitlements);
  });
});

// T021 — R007, NF002, EC005: useEntitlement hook
describe('useEntitlement — returns true when entitlement present (R007)', () => {
  it('WHEN response includes the name THEN returns true', async () => {
    mockApiFetch.mockResolvedValue({ entitlements: ['advanced_analytics', 'api_access'] });

    const { result } = renderHook(() => useEntitlement('advanced_analytics'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('WHEN response does not include the name THEN returns false', async () => {
    mockApiFetch.mockResolvedValue({ entitlements: ['api_access'] });

    const { result } = renderHook(() => useEntitlement('team_collaboration'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe('useEntitlement — EC005: 401 response returns false without throwing', () => {
  it('WHEN the API returns 401 THEN returns false without throwing', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Unauthorized', 401));

    const { result } = renderHook(() => useEntitlement('advanced_analytics'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(false));
  });
});
