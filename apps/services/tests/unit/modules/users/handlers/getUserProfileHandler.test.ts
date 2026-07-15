import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserProfile } from '@repo/types';
import { getUserProfileHandler } from '../../../../../src/modules/users/handlers/getUserProfileHandler.js';

// Mock db to prevent real DB connections
jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const profile: UserProfile = {
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

jest.mock('../../../../../src/modules/users/repositories/userDBRepository.js', () => ({
  UserDBRepository: jest.fn().mockImplementation(() => ({
    findByClerkUserId: jest.fn(),
    updatePreferences: jest.fn(),
    completeOnboarding: jest.fn(),
  })),
}));

jest.mock('../../../../../src/modules/users/useCases/getUserProfileUseCase.js', () => ({
  GetUserProfileUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue(profile),
  })),
}));

function makeReply() {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(): FastifyRequest {
  return {
    userId: 'internal-uuid-should-not-be-used',
    clerkUserId: 'clerk_abc',
  } as unknown as FastifyRequest;
}

// T021 — R005: getUserProfileHandler resolves by Clerk ID
describe('getUserProfileHandler — resolves by Clerk ID (R005)', () => {
  it('calls GetUserProfileUseCase.execute with request.clerkUserId, not request.userId', async () => {
    const { GetUserProfileUseCase } = jest.requireMock(
      '../../../../../src/modules/users/useCases/getUserProfileUseCase.js',
    ) as { GetUserProfileUseCase: jest.Mock };

    const mockExecute = jest.fn().mockResolvedValue(profile);
    GetUserProfileUseCase.mockImplementation(() => ({ execute: mockExecute }));

    const request = makeRequest();
    const reply = makeReply();

    await getUserProfileHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('clerk_abc');
    expect(reply.send).toHaveBeenCalledWith({ data: profile });
  });
});
