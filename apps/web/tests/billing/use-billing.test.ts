import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { apiFetch, ApiError } from '../../src/api/client';
import { subscribe, getMySubscription, cancelSubscription } from '../../src/api/billing';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T007
describe('subscribe', () => {
  it('POSTs to /billing/subscriptions with bearer token and body', async () => {
    mockApiFetch.mockResolvedValue({ subscriptionId: 'sub-1', checkoutUrl: 'https://checkout.test' });

    const result = await subscribe('token-abc', { planCode: 'pro' });

    expect(mockApiFetch).toHaveBeenCalledWith('/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ planCode: 'pro' }),
      token: 'token-abc',
    });
    expect(result).toEqual({ subscriptionId: 'sub-1', checkoutUrl: 'https://checkout.test' });
  });
});

describe('getMySubscription', () => {
  it('GETs /billing/subscriptions/me and returns the subscription', async () => {
    const mockSub = { id: 'sub-1', status: 'active', plan_id: 'plan-1' };
    mockApiFetch.mockResolvedValue({ subscription: mockSub });

    const result = await getMySubscription('token-abc');

    expect(mockApiFetch).toHaveBeenCalledWith('/billing/subscriptions/me', { token: 'token-abc' });
    expect(result).toEqual(mockSub);
  });

  it('returns null when the backend responds 404', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Not Found', 404));

    const result = await getMySubscription('token-abc');

    expect(result).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Server Error', 500));

    await expect(getMySubscription('token-abc')).rejects.toThrow();
  });
});

describe('cancelSubscription', () => {
  it('POSTs to /billing/subscriptions/:id/cancel with token and body', async () => {
    mockApiFetch.mockResolvedValue({ subscription: {} });

    await cancelSubscription('token-abc', 'sub-1', { atPeriodEnd: true });

    expect(mockApiFetch).toHaveBeenCalledWith('/billing/subscriptions/sub-1/cancel', {
      method: 'POST',
      body: JSON.stringify({ atPeriodEnd: true }),
      token: 'token-abc',
    });
  });
});
