import type { CreateCheckoutInput, Transaction, TransactionListResponse } from '@repo/types';
import { apiFetch } from './client';

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
