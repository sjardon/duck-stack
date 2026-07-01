import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import type { QuotaName, QuotaState, QuotaUsage } from '@repo/types';
import { getMyQuotas } from '../api/billing';
import type { ApiError } from '../api/client';

const QUOTAS_QUERY_KEY = ['billing', 'quotas', 'me'] as const;

interface UseQuotaResult {
  count: number;
  soft_limit: number;
  hard_limit: number;
  state: QuotaState;
  period_end: string;
  isLoading: boolean;
}

export function useQuota(name: QuotaName): UseQuotaResult {
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery<QuotaUsage[], ApiError>({
    queryKey: QUOTAS_QUERY_KEY,
    queryFn: async () => {
      const token = await getToken();
      if (!token) return [];
      return getMyQuotas(token);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading || !data) {
    return {
      count: 0,
      soft_limit: Infinity,
      hard_limit: Infinity,
      state: 'normal',
      period_end: '',
      isLoading: true,
    };
  }

  const entry = data.find((q) => q.name === name);

  if (!entry) {
    return {
      count: 0,
      soft_limit: Infinity,
      hard_limit: Infinity,
      state: 'normal',
      period_end: '',
      isLoading: false,
    };
  }

  return {
    count: entry.count,
    soft_limit: entry.soft_limit,
    hard_limit: entry.hard_limit,
    state: entry.state,
    period_end: entry.period_end,
    isLoading: false,
  };
}

export function useInvalidateQuotas() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUOTAS_QUERY_KEY });
}
