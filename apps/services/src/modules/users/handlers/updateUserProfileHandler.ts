import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { db } from '../../../shared/infrastructure/db.js';
import { UserDBRepository } from '../repositories/userDBRepository.js';
import { UpdateUserProfileUseCase } from '../useCases/updateUserProfileUseCase.js';
import { UpdateProfileBody } from '../dtos/updateProfileDto.js';
import { ValidationError } from '../../../shared/errors.js';

export async function updateUserProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let body: ReturnType<typeof UpdateProfileBody.parse>;
  try {
    body = UpdateProfileBody.parse(request.body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError(err.issues[0]?.message ?? 'Invalid request body', err);
    }
    throw err;
  }

  const repo = new UserDBRepository(db);
  const useCase = new UpdateUserProfileUseCase(repo);

  const profile = await useCase.execute(request.userId!, body);

  return reply.send({ data: profile });
}
