import type { UserProfile } from '@repo/types';
import { CompleteOnboardingUseCase } from '../../../src/modules/users/useCases/CompleteOnboardingUseCase.js';
import { NotFoundError } from '../../../src/shared/errors.js';

const onboardingData = {
  job_role: 'Engineer',
  company_size: '11-50',
  primary_use_case: 'Build internal tools',
};

const completedProfile: UserProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  avatar_url: null,
  locale: null,
  timezone: null,
  job_role: 'Engineer',
  company_size: '11-50',
  primary_use_case: 'Build internal tools',
  onboarding_completed: true,
};

describe('CompleteOnboardingUseCase.execute', () => {
  it('(R003, R004) returns UserProfile with onboarding_completed true when repo resolves', async () => {
    const mockRepo = {
      findByClerkUserId: jest.fn(),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn().mockResolvedValue(completedProfile),
    };

    const useCase = new CompleteOnboardingUseCase(mockRepo);
    const result = await useCase.execute('clerk_abc', onboardingData);

    expect(mockRepo.completeOnboarding).toHaveBeenCalledWith('clerk_abc', onboardingData);
    expect(result.onboarding_completed).toBe(true);
    expect(result.job_role).toBe('Engineer');
    expect(result.company_size).toBe('11-50');
    expect(result.primary_use_case).toBe('Build internal tools');
  });

  it('(EC004) propagates NotFoundError when repo throws it', async () => {
    const mockRepo = {
      findByClerkUserId: jest.fn(),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn().mockRejectedValue(new NotFoundError('User')),
    };

    const useCase = new CompleteOnboardingUseCase(mockRepo);

    await expect(useCase.execute('clerk_missing', onboardingData)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('(EC005) propagates DB error when repo throws it', async () => {
    const dbError = new Error('connection refused');
    const mockRepo = {
      findByClerkUserId: jest.fn(),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn().mockRejectedValue(dbError),
    };

    const useCase = new CompleteOnboardingUseCase(mockRepo);

    await expect(useCase.execute('clerk_abc', onboardingData)).rejects.toThrow('connection refused');
  });

  it('(EC006) resolves with updated profile when user already has onboarding_completed true', async () => {
    const alreadyCompletedProfile: UserProfile = {
      ...completedProfile,
      job_role: 'Manager',
      company_size: '51-200',
      primary_use_case: 'Analytics',
    };

    const mockRepo = {
      findByClerkUserId: jest.fn(),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn().mockResolvedValue(alreadyCompletedProfile),
    };

    const useCase = new CompleteOnboardingUseCase(mockRepo);
    const result = await useCase.execute('clerk_abc', {
      job_role: 'Manager',
      company_size: '51-200',
      primary_use_case: 'Analytics',
    });

    expect(result.onboarding_completed).toBe(true);
    expect(result.job_role).toBe('Manager');
  });
});
