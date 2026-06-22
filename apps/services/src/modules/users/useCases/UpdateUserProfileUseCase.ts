import type { UserProfile } from '@repo/types';
import type { IUserRepository } from '../repositories/interfaces/IUserRepository.js';
import { NotFoundError } from '../../../shared/errors.js';

export class UpdateUserProfileUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(
    clerkUserId: string,
    patch: { locale?: string | null; timezone?: string | null },
  ): Promise<UserProfile> {
    const hasLocale = 'locale' in patch;
    const hasTimezone = 'timezone' in patch;

    // Empty patch — return current profile without mutating (EC003)
    if (!hasLocale && !hasTimezone) {
      const profile = await this.repo.findByClerkUserId(clerkUserId);
      if (!profile) {
        throw new NotFoundError('User');
      }
      return profile;
    }

    return this.repo.updatePreferences(clerkUserId, patch);
  }
}
