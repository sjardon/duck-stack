import type { UserProfile } from '@repo/types';
import type { IUserRepository } from '../repositories/interfaces/IUserRepository.js';

export class CompleteOnboardingUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(
    clerkUserId: string,
    data: { job_role: string; company_size: string; primary_use_case: string },
  ): Promise<UserProfile> {
    return this.repo.completeOnboarding(clerkUserId, data);
  }
}
