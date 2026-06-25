import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { resolveProvider } from '../../billing/providers/resolveProvider.js';
import { CreateSubscriptionBodySchema } from '../dtos/createSubscriptionDto.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { CreateSubscriptionUseCase } from '../useCases/createSubscriptionUseCase.js';

export async function createSubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = CreateSubscriptionBodySchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: parsed.error.issues.map((e) => e.message).join('; '),
    });
  }

  const repo = new SubscriptionDBRepository(db);
  const useCase = new CreateSubscriptionUseCase(repo, resolveProvider());

  const result = await useCase.execute(request.userId!, request.orgId ?? null, parsed.data);

  return reply.send(result);
}
