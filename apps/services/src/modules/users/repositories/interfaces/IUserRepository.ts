import type { UserProfile } from '@repo/types';

export interface IUserRepository {
  findByClerkUserId(clerkUserId: string): Promise<UserProfile | null>;
  updatePreferences(
    clerkUserId: string,
    patch: { locale?: string | null; timezone?: string | null },
  ): Promise<UserProfile>;
}
