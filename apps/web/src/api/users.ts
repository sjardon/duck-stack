import type { UserProfile } from '@repo/types';
import { apiFetch } from './client';

export async function fetchUserProfile(token: string): Promise<UserProfile> {
  const response = await apiFetch<{ data: UserProfile }>('/users/me', { token });
  return response.data;
}

export async function patchUserProfile(
  token: string,
  body: { locale?: string | null; timezone?: string | null },
): Promise<UserProfile> {
  const response = await apiFetch<{ data: UserProfile }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
  return response.data;
}

export async function postOnboarding(
  token: string,
  body: { job_role: string; company_size: string; primary_use_case: string },
): Promise<UserProfile> {
  const response = await apiFetch<{ data: UserProfile }>('/users/me/onboarding', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
  return response.data;
}
