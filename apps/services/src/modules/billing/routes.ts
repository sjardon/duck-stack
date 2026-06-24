import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/plugins/requireAuth.js';
import { checkoutHandler } from './handlers/checkoutHandler.js';
import { getTransactionHandler } from './handlers/getTransactionHandler.js';
import { listTransactionsHandler } from './handlers/listTransactionsHandler.js';
import { getRefundsHandler } from './handlers/getRefundsHandler.js';

export default fp(async function billingRoutes(fastify: FastifyInstance) {
  fastify.post('/billing/checkout', { preHandler: requireAuth }, checkoutHandler);
  fastify.get('/billing/transactions/:id', { preHandler: requireAuth }, getTransactionHandler);
  fastify.get('/billing/transactions', { preHandler: requireAuth }, listTransactionsHandler);
  fastify.get('/billing/transactions/:id/refunds', { preHandler: requireAuth }, getRefundsHandler);
});
