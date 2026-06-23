import type { UserProfile } from '@repo/types';

export interface IUserRepository {
  findByClerkUserId(clerkUserId: string): Promise<UserProfile | null>;
  updatePreferences(
    clerkUserId: string,
    patch: { locale?: string | null; timezone?: string | null },
  ): Promise<UserProfile>;
  completeOnboarding(
    clerkUserId: string,
    data: { job_role: string; company_size: string; primary_use_case: string },
  ): Promise<UserProfile>;
}
