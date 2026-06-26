import type {
  CreateCheckoutInput,
  EntitlementName,
  Transaction,
  TransactionListResponse,
  SubscriptionPlan,
  Subscription,
  CreateSubscriptionInput,
  CancelSubscriptionInput,
} from '@repo/types';
import { apiFetch, ApiError } from './client';

export async function createCheckout(
  token: string,
  body: CreateCheckoutInput,
): Promise<{ checkoutUrl: string; transactionId: string }> {
  return apiFetch<{ checkoutUrl: string; transactionId: string }>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function getTransaction(token: string, id: string): Promise<Transaction> {
  const response = await apiFetch<{ data: Transaction }>(`/billing/transactions/${id}`, { token });
  return response.data;
}

export async function listTransactions(
  token: string,
  params?: { limit?: number; cursor?: string },
): Promise<TransactionListResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  if (params?.cursor !== undefined) {
    query.set('cursor', params.cursor);
  }
  const qs = query.toString();
  const path = qs ? `/billing/transactions?${qs}` : '/billing/transactions';
  return apiFetch<TransactionListResponse>(path, { token });
}

export async function listPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiFetch<{ data: SubscriptionPlan[] }>('/billing/plans');
  return response.data;
}

export async function subscribe(
  token: string,
  body: CreateSubscriptionInput,
): Promise<{ subscriptionId: string; checkoutUrl?: string }> {
  return apiFetch<{ subscriptionId: string; checkoutUrl?: string }>('/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function getMySubscription(token: string): Promise<Subscription | null> {
  try {
    const response = await apiFetch<{ subscription: Subscription | null }>(
      '/billing/subscriptions/me',
      { token },
    );
    return response.subscription;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function getMyEntitlements(token: string): Promise<EntitlementName[]> {
  const response = await apiFetch<{ entitlements: EntitlementName[] }>('/billing/entitlements/me', { token });
  return response.entitlements;
}

export async function cancelSubscription(
  token: string,
  id: string,
  body: CancelSubscriptionInput,
): Promise<void> {
  await apiFetch<{ subscription: unknown }>(`/billing/subscriptions/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}
