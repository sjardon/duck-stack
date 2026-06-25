import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { db } from '../../../shared/infrastructure/db.js';
import { ClerkSyncRepository } from '../repositories/clerkSyncRepository.js';
import { dispatchClerkEvent } from './clerkEventHandlers.js';
import { authConfig } from '../../../shared/configs/authConfig.js';
import { ValidationError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export default fp(async function clerkWebhookRoutes(fastify: FastifyInstance) {
  const signingSecret = authConfig.clerkWebhookSigningSecret;

  if (!signingSecret) {
    throw new Error(
      'CLERK_WEBHOOK_SIGNING_SECRET environment variable is missing. ' +
        'Set it before starting the services application.',
    );
  }

  const repository = new ClerkSyncRepository(db);

  // Capture raw body as Buffer so Svix signature verification succeeds (NF001).
  // This content-type parser is scoped to this plugin only.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post('/webhooks/clerk', async (request, reply) => {
    const body = request.body as Buffer;

    const svixId = request.headers['svix-id'];
    const svixTimestamp = request.headers['svix-timestamp'];
    const svixSignature = request.headers['svix-signature'];

    // If any required Svix header is missing, throw ValidationError so errorHandler responds (R004, EC001)
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new ValidationError('Missing required Svix headers');
    }

    let event;
    try {
      // Construct a synthetic Web API Request so verifyWebhook can validate
      // the Svix signature against the raw body (R006, NF001).
      const syntheticRequest = new Request('https://placeholder/webhooks/clerk', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': svixId as string,
          'svix-timestamp': svixTimestamp as string,
          'svix-signature': svixSignature as string,
        },
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
      });

      event = await verifyWebhook(syntheticRequest, { signingSecret });
    } catch (err) {
      // R005, R008: log at warn before throwing; signature verification failure stays HTTP 400 per EC002 decision
      logger.warn({ err }, 'Clerk webhook signature verification failed');
      throw new ValidationError('Webhook signature verification failed', err instanceof Error ? err : undefined);
    }

    // Dispatch to the appropriate event handler (R009–R012, EC002)
    await dispatchClerkEvent(event, repository);

    // Success (R008, NF002)
    return reply.status(200).send({ received: true });
  });
});
