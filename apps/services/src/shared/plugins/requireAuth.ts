import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors.js';
import { logger } from '../infrastructure/logger.js';

export function requireAuth(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  logger.info(`requireAuth: checking authentication for request with userId: ${request.userId}, orgId: ${request.orgId}`);
  if (request.userId === undefined) {
    throw new UnauthorizedError();
  }
  done();
}
