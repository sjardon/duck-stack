import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { db } from '../../../shared/infrastructure/db.js';
import { UserDBRepository } from '../repositories/UserDBRepository.js';
import { UpdateUserProfileUseCase } from '../useCases/UpdateUserProfileUseCase.js';
import { UpdateProfileBody } from '../dtos/updateProfile.dto.js';

export async function updateUserProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let body: ReturnType<typeof UpdateProfileBody.parse>;
  try {
    body = UpdateProfileBody.parse(request.body);
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid request body' });
    }
    throw err;
  }

  const repo = new UserDBRepository(db);
  const useCase = new UpdateUserProfileUseCase(repo);

  const profile = await useCase.execute(request.userId!, body);

  return reply.send({ data: profile });
}
