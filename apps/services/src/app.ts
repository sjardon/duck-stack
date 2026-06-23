import crypto from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import errorHandlerPlugin from './shared/plugins/error-handler.js';
import corsPlugin from './shared/plugins/cors.js';
import helmetPlugin from './shared/plugins/helmet.js';
import clerkAuthPlugin from './shared/plugins/clerk-auth.plugin.js';
import healthRoutes from './modules/health/routes.js';
import clerkWebhookRoutes from './modules/webhooks/clerk/routes.js';
import mobbexWebhookRoutes from './modules/webhooks/mobbex/routes.js';
import usersRoutes from './modules/users/routes.js';
import billingRoutes from './modules/billing/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';
import { resolveProvider } from './modules/billing/providers/resolveProvider.js';

export async function createApp(): Promise<FastifyInstance> {
  // Fail fast on misconfigured payment provider before the HTTP server starts
  resolveProvider();

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
  });

  await fastify.register(errorHandlerPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(mobbexWebhookRoutes);
  await fastify.register(clerkWebhookRoutes);
  await fastify.register(clerkAuthPlugin);
  await fastify.register(usersRoutes);
  await fastify.register(billingRoutes);
  await fastify.register(subscriptionsRoutes);
  await fastify.register(healthRoutes);

  return fastify;
}
