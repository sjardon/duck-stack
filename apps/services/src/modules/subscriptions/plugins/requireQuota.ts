import type { FastifyRequest } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { UsageCounterDBRepository } from '../repositories/usageCounterDBRepository.js';
import { RequireQuotaUseCase } from '../useCases/requireQuotaUseCase.js';

const subscriptionRepo = new SubscriptionDBRepository(db);
const counterRepo = new UsageCounterDBRepository(db);
const useCase = new RequireQuotaUseCase(subscriptionRepo, counterRepo);

/**
 * preHandler factory that enforces a named quota on a route.
 * Each request always increments the counter — no per-request caching.
 */
export function requireQuota(name: string): (request: FastifyRequest) => Promise<void> {
  return async function (request: FastifyRequest): Promise<void> {
    // EC005: if orgId is set the scope is the organization
    const userId = request.userId!;
    const orgId = request.orgId ?? null;

    await useCase.execute(userId, orgId, name);
  };
}
