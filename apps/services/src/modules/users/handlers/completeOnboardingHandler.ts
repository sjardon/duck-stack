import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { db } from '../../../shared/infrastructure/db.js';
import { UserDBRepository } from '../repositories/userDBRepository.js';
import { CompleteOnboardingUseCase } from '../useCases/completeOnboardingUseCase.js';
import { CompleteOnboardingBody } from '../dtos/completeOnboarding.dto.js';

export async function completeOnboardingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let body: ReturnType<typeof CompleteOnboardingBody.parse>;
  try {
    body = CompleteOnboardingBody.parse(request.body);
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid request body' });
    }
    throw err;
  }

  const repo = new UserDBRepository(db);
  const useCase = new CompleteOnboardingUseCase(repo);

  const profile = await useCase.execute(request.userId!, body);

  return reply.send({ data: profile });
}
