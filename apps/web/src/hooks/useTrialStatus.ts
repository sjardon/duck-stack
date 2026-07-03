import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import type { Subscription } from '@repo/types';
import { getMySubscription } from '../api/billing';
import type { ApiError } from '../api/client';

const MY_SUBSCRIPTION_QUERY_KEY = ['billing', 'subscriptions', 'me'] as const;

export interface TrialStatus {
  isTrialing: boolean;
  daysRemaining: number | null;
  trialEndsAt: string | null;
  isExpired: boolean;
  isLoading: boolean;
}

function deriveTrialStatus(data: Subscription | null | undefined, isLoading: boolean): TrialStatus {
  if (isLoading || data === undefined) {
    return {
      isTrialing: false,
      daysRemaining: null,
      trialEndsAt: null,
      isExpired: false,
      isLoading: true,
    };
  }

  if (data === null) {
    return {
      isTrialing: false,
      daysRemaining: null,
      trialEndsAt: null,
      isExpired: false,
      isLoading: false,
    };
  }

  if (data.status === 'trialing') {
    return {
      isTrialing: true,
      daysRemaining: data.days_remaining ?? null,
      trialEndsAt: data.trial_ends_at,
      isExpired: false,
      isLoading: false,
    };
  }

  if (data.status === 'expired') {
    return {
      isTrialing: false,
      daysRemaining: null,
      trialEndsAt: data.trial_ends_at,
      isExpired: true,
      isLoading: false,
    };
  }

  // Default: active, pending, past_due, canceled, or any other non-terminal status
  return {
    isTrialing: false,
    daysRemaining: null,
    trialEndsAt: null,
    isExpired: false,
    isLoading: false,
  };
}

export function useTrialStatus(): TrialStatus {
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery<Subscription | null, ApiError>({
    queryKey: MY_SUBSCRIPTION_QUERY_KEY,
    queryFn: async () => {
      const token = await getToken();
      return getMySubscription(token!);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return deriveTrialStatus(data, isLoading);
}

export function useInvalidateMySubscription(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: MY_SUBSCRIPTION_QUERY_KEY });
}
