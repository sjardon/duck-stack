import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { GetEntitlementsUseCase } from '../useCases/getEntitlementsUseCase.js';

export async function getMyEntitlementsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const repo = new SubscriptionDBRepository(db);
  const useCase = new GetEntitlementsUseCase(repo);

  const entitlements = await useCase.execute(request.userId!, request.orgId ?? null);

  return reply.send({ entitlements });
}
