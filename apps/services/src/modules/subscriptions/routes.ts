import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { listPlansHandler } from './handlers/listPlansHandler.js';

export default fp(async function subscriptionsRoutes(fastify: FastifyInstance) {
  fastify.get('/billing/plans', listPlansHandler);
});
