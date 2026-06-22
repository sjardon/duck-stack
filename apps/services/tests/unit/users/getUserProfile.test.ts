import type { UserProfile } from '@repo/types';
import { UserDBRepository } from '../../../src/modules/users/repositories/UserDBRepository.js';
import { GetUserProfileUseCase } from '../../../src/modules/users/useCases/GetUserProfileUseCase.js';

// T001: schema-level contract check — findByClerkUserId returns onboarding columns
describe('UserDBRepository.findByClerkUserId — onboarding columns', () => {
  it('returns onboarding_completed, job_role, company_size, primary_use_case from the db row', async () => {
    const mockRow: UserProfile = {
      name: 'Alice',
      email: 'alice@example.com',
      avatar_url: null,
      locale: null,
      timezone: null,
      job_role: 'Engineer',
      company_size: '11-50',
      primary_use_case: 'Build internal tools',
      onboarding_completed: false,
    };

    const mockSql = jest.fn().mockResolvedValue([mockRow]);
    // Make it behave as a tagged template function
    const sql = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => mockSql(strings, ..._values),
      mockSql,
    );

    const repo = new UserDBRepository(sql as never);
    const result = await repo.findByClerkUserId('clerk_abc');

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('onboarding_completed', false);
    expect(result).toHaveProperty('job_role', 'Engineer');
    expect(result).toHaveProperty('company_size', '11-50');
    expect(result).toHaveProperty('primary_use_case', 'Build internal tools');
  });
});

// T005: GetUserProfileUseCase.execute returns UserProfile with onboarding fields
describe('GetUserProfileUseCase.execute — onboarding fields', () => {
  it('returns a UserProfile that includes onboarding_completed and the three segmentation fields', async () => {
    const mockProfile: UserProfile = {
      name: 'Alice',
      email: 'alice@example.com',
      avatar_url: null,
      locale: null,
      timezone: null,
      job_role: null,
      company_size: null,
      primary_use_case: null,
      onboarding_completed: false,
    };

    const mockRepo = {
      findByClerkUserId: jest.fn().mockResolvedValue(mockProfile),
      updatePreferences: jest.fn(),
      completeOnboarding: jest.fn(),
    };

    const useCase = new GetUserProfileUseCase(mockRepo);
    const result = await useCase.execute('clerk_abc');

    expect(result).toHaveProperty('onboarding_completed', false);
    expect(result).toHaveProperty('job_role', null);
    expect(result).toHaveProperty('company_size', null);
    expect(result).toHaveProperty('primary_use_case', null);
  });
});
