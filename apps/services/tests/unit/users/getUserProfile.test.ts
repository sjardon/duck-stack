import type { UserProfile } from '@repo/types';
import type { BaseLogger } from 'pino';
import { UserDBRepository } from '../../../src/modules/users/repositories/userDBRepository.js';
import { GetUserProfileUseCase } from '../../../src/modules/users/useCases/getUserProfileUseCase.js';

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
    const fakeLogger = makeLogger();
    const result = await repo.findByClerkUserId('clerk_abc', fakeLogger);

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
    const fakeLogger = makeLogger();
    const result = await useCase.execute('clerk_abc', fakeLogger);

    expect(result).toHaveProperty('onboarding_completed', false);
    expect(result).toHaveProperty('job_role', null);
    expect(result).toHaveProperty('company_size', null);
    expect(result).toHaveProperty('primary_use_case', null);
  });
});
