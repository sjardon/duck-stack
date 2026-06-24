import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionPlanDBRepository } from '../repositories/subscriptionPlanDBRepository.js';
import { ListPlansUseCase } from '../useCases/listPlansUseCase.js';

const repo = new SubscriptionPlanDBRepository(db);
const useCase = new ListPlansUseCase(repo);

export async function listPlansHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await useCase.execute(request.log);
  return reply.send({ data });
}
