import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors.js';

export function requireAuth(request: FastifyRequest): void {
  if (request.userId === undefined) {
    throw new UnauthorizedError();
  }
}
