import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import type { SubscriptionPlan, Subscription, CreateSubscriptionInput, CancelSubscriptionInput } from '@repo/types';
import { listPlans, subscribe, getMySubscription, cancelSubscription } from '../api/billing';
import type { ApiError } from '../api/client';

export function usePlans() {
  return useQuery<SubscriptionPlan[], ApiError>({
    queryKey: ['billing', 'plans'],
    queryFn: () => listPlans(),
  });
}

export function useMySubscription() {
  const { getToken } = useAuth();

  return useQuery<Subscription | null, ApiError>({
    queryKey: ['billing', 'subscriptions', 'me'],
    queryFn: async () => {
      const token = await getToken();
      return getMySubscription(token!);
    },
  });
}

export function useSubscribe() {
  const { getToken } = useAuth();

  return useMutation<
    { subscriptionId: string; checkoutUrl?: string },
    ApiError,
    CreateSubscriptionInput
  >({
    mutationFn: async (body) => {
      const token = await getToken();
      return subscribe(token!, body);
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<void, ApiError, { id: string; body: CancelSubscriptionInput }>({
    mutationFn: async ({ id, body }) => {
      const token = await getToken();
      return cancelSubscription(token!, id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing', 'subscriptions', 'me'] });
    },
  });
}
