import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserProfile } from '@repo/types';
import { ValidationError } from '../../../src/shared/errors.js';
import { completeOnboardingHandler } from '../../../src/modules/users/handlers/completeOnboardingHandler.js';

// Mock db and UserDBRepository to prevent real DB connections
jest.mock('../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

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

jest.mock('../../../src/modules/users/repositories/userDBRepository.js', () => ({
  UserDBRepository: jest.fn().mockImplementation(() => ({
    findByClerkUserId: jest.fn(),
    updatePreferences: jest.fn(),
    completeOnboarding: jest.fn().mockResolvedValue(completedProfile),
  })),
}));

jest.mock('../../../src/modules/users/useCases/completeOnboardingUseCase.js', () => ({
  CompleteOnboardingUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue(completedProfile),
  })),
}));

function makeReply() {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(body: unknown, userId = 'clerk_abc'): FastifyRequest {
  return { body, userId } as unknown as FastifyRequest;
}

describe('completeOnboardingHandler', () => {
  it('(R001, R003) throws ValidationError when a field is missing', async () => {
    const request = makeRequest({ job_role: 'Engineer', company_size: '11-50' });
    const reply = makeReply();

    await expect(completeOnboardingHandler(request, reply)).rejects.toBeInstanceOf(ValidationError);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('(R001, R003) throws ValidationError when a field is an empty string', async () => {
    const request = makeRequest({
      job_role: '',
      company_size: '11-50',
      primary_use_case: 'Build tools',
    });
    const reply = makeReply();

    await expect(completeOnboardingHandler(request, reply)).rejects.toBeInstanceOf(ValidationError);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('(R001, R003) throws ValidationError when a field is a non-string value', async () => {
    const request = makeRequest({
      job_role: 123,
      company_size: '11-50',
      primary_use_case: 'Build tools',
    });
    const reply = makeReply();

    await expect(completeOnboardingHandler(request, reply)).rejects.toBeInstanceOf(ValidationError);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('(R014) thrown ValidationError has code VALIDATION_ERROR', async () => {
    const request = makeRequest({ job_role: 'Engineer', company_size: '11-50' });
    const reply = makeReply();

    let thrown: unknown;
    try {
      await completeOnboardingHandler(request, reply);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).code).toBe('VALIDATION_ERROR');
  });

  it('(NF001) valid body reaches use case and returns 200 with profile', async () => {
    const { CompleteOnboardingUseCase } = jest.requireMock(
      '../../../src/modules/users/useCases/completeOnboardingUseCase.js',
    ) as { CompleteOnboardingUseCase: jest.Mock };

    const mockExecute = jest.fn().mockResolvedValue(completedProfile);
    CompleteOnboardingUseCase.mockImplementation(() => ({ execute: mockExecute }));

    const request = makeRequest({
      job_role: 'Engineer',
      company_size: '11-50',
      primary_use_case: 'Build internal tools',
    });
    const reply = makeReply();

    await completeOnboardingHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('clerk_abc', {
      job_role: 'Engineer',
      company_size: '11-50',
      primary_use_case: 'Build internal tools',
    });
    expect(reply.send).toHaveBeenCalledWith({ data: completedProfile });
  });
});
