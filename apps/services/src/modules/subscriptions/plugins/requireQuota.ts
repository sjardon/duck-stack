import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { UsageCounterDBRepository } from '../repositories/usageCounterDBRepository.js';
import { RequireQuotaUseCase } from '../useCases/requireQuotaUseCase.js';

declare module 'fastify' {
  interface FastifyRequest {
    quotaReservations: Record<string, {
      reserved: number;
      charged: number;
      rowKey: { userId: string | null; orgId: string | null; periodStart: string };
    }> | null;
  }
}

const subscriptionRepo = new SubscriptionDBRepository(db);
const counterRepo = new UsageCounterDBRepository(db);
const useCase = new RequireQuotaUseCase(subscriptionRepo, counterRepo);

/**
 * Fastify plugin that registers the `quotaReservations` request decoration.
 * Must be registered via `fastify.register(requireQuotaPlugin)` so that
 * `request.quotaReservations` is available across all encapsulated plugin contexts.
 */
export default fp(async function requireQuotaPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('quotaReservations', null);
});

/**
 * preHandler factory that enforces a named quota on a route.
 * Each request always increments the counter — no per-request caching.
 * Passes the full request to the use case so the strategy can compute cost from it.
 * In post mode the use case decorates request.quotaReservations[name].
 */
export function requireQuota(name: string): (request: FastifyRequest) => Promise<void> {
  return async function (request: FastifyRequest): Promise<void> {
    // EC005: if orgId is set the scope is the organization
    const userId = request.userId!;
    const orgId = request.orgId ?? null;

    await useCase.execute(userId, orgId, name, request);
  };
}
