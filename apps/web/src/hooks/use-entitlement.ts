import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import type { EntitlementName } from '@repo/types';
import { getMyEntitlements } from '../api/billing';
import type { ApiError } from '../api/client';

export function useEntitlement(name: EntitlementName): boolean {
  const { getToken } = useAuth();

  const { data } = useQuery<EntitlementName[], ApiError>({
    queryKey: ['billing', 'entitlements', 'me'],
    queryFn: async () => {
      try {
        const token = await getToken();
        if (!token) return [];
        return getMyEntitlements(token);
      } catch (err) {
        if ((err as ApiError).status === 401) return [];
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  return (data ?? []).includes(name);
}
