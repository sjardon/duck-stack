import 'fastify';
import type { FastifyRequest } from 'fastify';
import type { EntitlementName } from '@repo/types';
import { db } from '../../../shared/infrastructure/db.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { GetEntitlementsUseCase } from '../useCases/getEntitlementsUseCase.js';
import { EntitlementRequiredError } from '../../../shared/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    entitlements?: EntitlementName[];
  }
}

const repo = new SubscriptionDBRepository(db);
const useCase = new GetEntitlementsUseCase(repo);

export function requireEntitlement(name: EntitlementName) {
  return async function (request: FastifyRequest): Promise<void> {
    if (request.entitlements === undefined) {
      request.entitlements = await useCase.execute(request.userId!, request.orgId ?? null);
    }
    if (!request.entitlements.includes(name)) {
      throw new EntitlementRequiredError(name);
    }
  };
}
