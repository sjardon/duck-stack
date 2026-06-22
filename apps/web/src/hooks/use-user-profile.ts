import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import type { UserProfile } from '@repo/types';
import { fetchUserProfile, patchUserProfile } from '../api/users';
import type { ApiError } from '../api/client';

export function useUserProfile() {
  const { getToken } = useAuth();

  return useQuery<UserProfile, ApiError>({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const token = await getToken();
      return fetchUserProfile(token!);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const [savedOk, setSavedOk] = useState(false);

  const mutation = useMutation<
    UserProfile,
    ApiError,
    { locale?: string | null; timezone?: string | null }
  >({
    mutationFn: async (body) => {
      const token = await getToken();
      return patchUserProfile(token!, body);
    },
    onMutate: () => {
      setSavedOk(false);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      setSavedOk(true);
    },
    onError: () => {
      setSavedOk(false);
    },
  });

  return { ...mutation, savedOk };
}
