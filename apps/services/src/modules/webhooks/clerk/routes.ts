import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { db } from '../../../shared/infrastructure/db.js';
import { ClerkSyncRepository } from '../repositories/clerkSyncRepository.js';
import { dispatchClerkEvent } from './clerkEventHandlers.js';
import { authConfig } from '../../../shared/configs/authConfig.js';

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

    // If any required Svix header is missing, reject immediately (EC001)
    if (!svixId || !svixTimestamp || !svixSignature) {
      return reply.status(400).send({ error: 'Missing required Svix headers' });
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
    } catch {
      // Invalid signature or missing headers (R007, EC001)
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }

    // Dispatch to the appropriate event handler (R009–R012, EC002)
    await dispatchClerkEvent(event, repository, request.log);

    // Success (R008, NF002)
    return reply.status(200).send({ received: true });
  });
});
