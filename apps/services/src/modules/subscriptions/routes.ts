import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/plugins/requireAuth.js';
import { listPlansHandler } from './handlers/listPlansHandler.js';
import { createSubscriptionHandler } from './handlers/createSubscriptionHandler.js';
import { cancelSubscriptionHandler } from './handlers/cancelSubscriptionHandler.js';
import { getMySubscriptionHandler } from './handlers/getMySubscriptionHandler.js';
import { getMyEntitlementsHandler } from './handlers/getMyEntitlementsHandler.js';
import { getMyQuotasHandler } from './handlers/getMyQuotasHandler.js';

export default fp(async function subscriptionsRoutes(fastify: FastifyInstance) {
  fastify.get('/billing/plans', listPlansHandler);
  fastify.post('/billing/subscriptions', { preHandler: requireAuth }, createSubscriptionHandler);
  fastify.post('/billing/subscriptions/:id/cancel', { preHandler: requireAuth }, cancelSubscriptionHandler);
  fastify.get('/billing/subscriptions/me', { preHandler: requireAuth }, getMySubscriptionHandler);
  fastify.get('/billing/entitlements/me', { preHandler: requireAuth }, getMyEntitlementsHandler);
  fastify.get('/billing/quotas/me', { preHandler: requireAuth }, getMyQuotasHandler);
});
