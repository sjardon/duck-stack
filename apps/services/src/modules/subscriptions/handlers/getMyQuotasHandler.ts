import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { UsageCounterDBRepository } from '../repositories/usageCounterDBRepository.js';
import { GetMyQuotasUseCase } from '../useCases/getMyQuotasUseCase.js';

export async function getMyQuotasHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const subscriptionRepo = new SubscriptionDBRepository(db);
  const counterRepo = new UsageCounterDBRepository(db);
  const useCase = new GetMyQuotasUseCase(subscriptionRepo, counterRepo);

  const quotas = await useCase.execute(request.userId!, request.orgId ?? null);

  return reply.send({ quotas });
}
