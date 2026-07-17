import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { GetMySubscriptionUseCase } from '../useCases/getMySubscriptionUseCase.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export async function getMySubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const repo = new SubscriptionDBRepository(db);
  const useCase = new GetMySubscriptionUseCase(repo);

  logger.info(`Fetching subscription for userId: ${request.userId}, orgId: ${request.orgId}`);

  const subscription = await useCase.execute(request.userId!, request.orgId ?? null);

  // R010: trial_ends_at and days_remaining are already present on the entity
  // when status === 'trialing'; pass them through as-is
  return reply.send({ subscription });
}

