import crypto from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import errorHandlerPlugin from './shared/plugins/errorHandler.js';
import corsPlugin from './shared/plugins/cors.js';
import helmetPlugin from './shared/plugins/helmet.js';
import clerkAuthPlugin from './shared/plugins/clerkAuthPlugin.js';
import healthRoutes from './modules/health/routes.js';
import clerkWebhookRoutes from './modules/webhooks/clerk/routes.js';
import mobbexWebhookRoutes from './modules/webhooks/mobbex/routes.js';
import usersRoutes from './modules/users/routes.js';
import billingRoutes from './modules/billing/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';
import { resolveProvider } from './modules/billing/providers/resolveProvider.js';
import { serverConfig } from './shared/configs/serverConfig.js';
import { requestContext } from './shared/infrastructure/requestContext.js';
import { requireActiveSubscription } from './modules/subscriptions/plugins/requireActiveSubscription.js';
import requireQuotaPlugin from './modules/subscriptions/plugins/requireQuota.js';

export async function createApp(): Promise<FastifyInstance> {
  // Fail fast on misconfigured payment provider before the HTTP server starts
  resolveProvider();

  const fastify = Fastify({
    logger: {
      level: serverConfig.logLevel,
      transport:
        serverConfig.nodeEnv !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
  });

  fastify.addHook('onRequest', (request, _reply, done) => {
    requestContext.run({ requestId: request.id }, done);
  });

  await fastify.register(errorHandlerPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(mobbexWebhookRoutes);
  await fastify.register(clerkWebhookRoutes);
  await fastify.register(clerkAuthPlugin);

  // R008, EC005: global trial-expiry guard registered after clerkAuthPlugin
  // so request.userId is already populated. Excludes billing, webhook, and health routes.
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const url = request.raw.url ?? '';
    if (
      url.startsWith('/billing/') ||
      url.startsWith('/webhooks/') ||
      url === '/health'
    ) return;
    await requireActiveSubscription(request);
  });

  await fastify.register(requireQuotaPlugin);
  await fastify.register(usersRoutes);
  await fastify.register(billingRoutes);
  await fastify.register(subscriptionsRoutes);
  await fastify.register(healthRoutes);

  return fastify;
}
