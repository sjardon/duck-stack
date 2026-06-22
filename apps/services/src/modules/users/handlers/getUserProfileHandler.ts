import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { UserDBRepository } from '../repositories/UserDBRepository.js';
import { GetUserProfileUseCase } from '../useCases/GetUserProfileUseCase.js';

export async function getUserProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const repo = new UserDBRepository(db);
  const useCase = new GetUserProfileUseCase(repo);

  const profile = await useCase.execute(request.userId!);

  return reply.send({ data: profile });
}
