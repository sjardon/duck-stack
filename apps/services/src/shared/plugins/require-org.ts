import type { FastifyRequest } from 'fastify';
import { requireAuth } from './require-auth.js';
import { ForbiddenError } from '../errors.js';

export function requireOrg(request: FastifyRequest): void {
  requireAuth(request);

  if (request.orgId === null) {
    throw new ForbiddenError();
  }
}
