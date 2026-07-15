import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { db } from '../../../shared/infrastructure/db.js';
import { UserDBRepository } from '../repositories/userDBRepository.js';
import { CompleteOnboardingUseCase } from '../useCases/completeOnboardingUseCase.js';
import { CompleteOnboardingBody } from '../dtos/completeOnboardingDto.js';
import { ValidationError } from '../../../shared/errors.js';

export async function completeOnboardingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let body: ReturnType<typeof CompleteOnboardingBody.parse>;
  try {
    body = CompleteOnboardingBody.parse(request.body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError(err.issues[0]?.message ?? 'Invalid request body', err);
    }
    throw err;
  }

  const repo = new UserDBRepository(db);
  const useCase = new CompleteOnboardingUseCase(repo);

  const profile = await useCase.execute(request.clerkUserId!, body);

  return reply.send({ data: profile });
}
