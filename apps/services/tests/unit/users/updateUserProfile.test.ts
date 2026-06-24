import type { UserProfile } from '@repo/types';
import type { BaseLogger } from 'pino';
import { UpdateUserProfileUseCase } from '../../../src/modules/users/useCases/updateUserProfileUseCase.js';
import { NotFoundError } from '../../../src/shared/errors.js';

function makeLogger(): BaseLogger {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    silent: jest.fn(),
    level: 'info',
    child: jest.fn(),
  } as unknown as BaseLogger;
}

const updatedProfile: UserProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  avatar_url: null,
  locale: 'es',
  timezone: 'America/Buenos_Aires',
  job_role: 'Engineer',
  company_size: '11-50',
  primary_use_case: 'Build internal tools',
  onboarding_completed: true,
};

describe('UpdateUserProfileUseCase.execute — logger (T016, R001, R002, EC003)', () => {
  it('WHEN execute is called with a patch THEN forwards logger to repo.updatePreferences', async () => {
    const mockRepo = {
      findByClerkUserId: jest.fn(),
      updatePreferences: jest.fn().mockResolvedValue(updatedProfile),
      completeOnboarding: jest.fn(),
    };

    const useCase = new UpdateUserProfileUseCase(mockRepo);
    const fakeLogger = makeLogger();

    const result = await useCase.execute(
      'clerk_abc',
      { locale: 'es', timezone: 'America/Buenos_Aires' },
      fakeLogger,
    );

    expect(mockRepo.updatePreferences).toHaveBeenCalledWith(
      'clerk_abc',
      { locale: 'es', timezone: 'America/Buenos_Aires' },
      fakeLogger,
    );
    expect(result.locale).toBe('es');
    expect(result.timezone).toBe('America/Buenos_Aires');
  });

  it('WHEN execute is called with an empty patch THEN forwards logger to repo.findByClerkUserId', async () => {
    const mockRepo = {
      findByClerkUserId: jest.fn().mockResolvedValue(updatedProfile),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn(),
    };

    const useCase = new UpdateUserProfileUseCase(mockRepo);
    const fakeLogger = makeLogger();

    const result = await useCase.execute('clerk_abc', {}, fakeLogger);

    expect(mockRepo.findByClerkUserId).toHaveBeenCalledWith('clerk_abc', fakeLogger);
    expect(mockRepo.updatePreferences).not.toHaveBeenCalled();
    expect(result).toEqual(updatedProfile);
  });

  it('WHEN execute is called with empty patch and user not found THEN throws NotFoundError', async () => {
    const mockRepo = {
      findByClerkUserId: jest.fn().mockResolvedValue(null),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn(),
    };

    const useCase = new UpdateUserProfileUseCase(mockRepo);
    const fakeLogger = makeLogger();

    await expect(useCase.execute('clerk_missing', {}, fakeLogger)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockRepo.findByClerkUserId).toHaveBeenCalledWith('clerk_missing', fakeLogger);
  });
});
