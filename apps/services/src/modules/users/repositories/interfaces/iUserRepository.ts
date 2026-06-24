import type { BaseLogger } from 'pino';
import type { UserProfile } from '@repo/types';

export interface IUserRepository {
  findByClerkUserId(clerkUserId: string, logger: BaseLogger): Promise<UserProfile | null>;
  updatePreferences(
    clerkUserId: string,
    patch: { locale?: string | null; timezone?: string | null },
    logger: BaseLogger,
  ): Promise<UserProfile>;
  completeOnboarding(
    clerkUserId: string,
    data: { job_role: string; company_size: string; primary_use_case: string },
    logger: BaseLogger,
  ): Promise<UserProfile>;
}
