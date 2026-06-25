import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserProfile } from '@repo/types';
import { ValidationError } from '../../../../../src/shared/errors.js';
import { updateUserProfileHandler } from '../../../../../src/modules/users/handlers/updateUserProfileHandler.js';

// Mock db to prevent real DB connections
jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const updatedProfile: UserProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  avatar_url: null,
  locale: 'en-US',
  timezone: 'America/New_York',
  job_role: 'Engineer',
  company_size: '11-50',
  primary_use_case: 'Build internal tools',
  onboarding_completed: true,
};

jest.mock('../../../../../src/modules/users/repositories/userDBRepository.js', () => ({
  UserDBRepository: jest.fn().mockImplementation(() => ({
    findByClerkUserId: jest.fn(),
    updatePreferences: jest.fn(),
    completeOnboarding: jest.fn(),
  })),
}));

jest.mock('../../../../../src/modules/users/useCases/updateUserProfileUseCase.js', () => ({
  UpdateUserProfileUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue(updatedProfile),
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

describe('updateUserProfileHandler', () => {
  it('(R002, R003) throws ValidationError when body has unexpected fields (strict schema)', async () => {
    const request = makeRequest({ unknownField: 'value' });
    const reply = makeReply();

    await expect(updateUserProfileHandler(request, reply)).rejects.toBeInstanceOf(ValidationError);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('(R002, R003) throws ValidationError when locale is not a string or null', async () => {
    const request = makeRequest({ locale: 123 });
    const reply = makeReply();

    await expect(updateUserProfileHandler(request, reply)).rejects.toBeInstanceOf(ValidationError);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('(R014) thrown ValidationError has code VALIDATION_ERROR', async () => {
    const request = makeRequest({ locale: 123 });
    const reply = makeReply();

    let thrown: unknown;
    try {
      await updateUserProfileHandler(request, reply);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).code).toBe('VALIDATION_ERROR');
  });

  it('(NF001) valid body reaches use case and reply.send is called with { data: profile }', async () => {
    const { UpdateUserProfileUseCase } = jest.requireMock(
      '../../../../../src/modules/users/useCases/updateUserProfileUseCase.js',
    ) as { UpdateUserProfileUseCase: jest.Mock };

    const mockExecute = jest.fn().mockResolvedValue(updatedProfile);
    UpdateUserProfileUseCase.mockImplementation(() => ({ execute: mockExecute }));

    const request = makeRequest({ locale: 'en-US', timezone: 'America/New_York' });
    const reply = makeReply();

    await updateUserProfileHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('clerk_abc', { locale: 'en-US', timezone: 'America/New_York' });
    expect(reply.send).toHaveBeenCalledWith({ data: updatedProfile });
    expect(reply.status).not.toHaveBeenCalledWith(400);
  });
});
