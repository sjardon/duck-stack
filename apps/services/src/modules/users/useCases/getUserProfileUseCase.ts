import type { BaseLogger } from 'pino';
import type { UserProfile } from '@repo/types';
import type { IUserRepository } from '../repositories/interfaces/iUserRepository.js';
import { NotFoundError } from '../../../shared/errors.js';

export class GetUserProfileUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(clerkUserId: string, logger: BaseLogger): Promise<UserProfile> {
    const profile = await this.repo.findByClerkUserId(clerkUserId, logger);

    if (!profile) {
      throw new NotFoundError('User');
    }

    return profile;
  }
}
