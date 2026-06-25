import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { GetMySubscriptionUseCase } from '../useCases/getMySubscriptionUseCase.js';

export async function getMySubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const repo = new SubscriptionDBRepository(db);
  const useCase = new GetMySubscriptionUseCase(repo);

  const subscription = await useCase.execute(request.userId!, request.orgId ?? null);

  return reply.send({ subscription });
}
