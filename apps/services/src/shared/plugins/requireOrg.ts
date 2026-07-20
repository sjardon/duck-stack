import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from './requireAuth.js';
import { ForbiddenError } from '../errors.js';

export function requireOrg(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  requireAuth(request, reply, () => {
    if (request.orgId === null) {
      throw new ForbiddenError();
    }
    done();
  });
}
