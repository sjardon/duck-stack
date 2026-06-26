import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { mobbexConfig } from '../../../shared/configs/mobbexConfig.js';
import { db } from '../../../shared/infrastructure/db.js';
import { MobbexBillingSyncRepository } from '../repositories/mobbexBillingSyncRepository.js';
import { dispatchMobbexEvent } from './mobbexEventHandlers.js';
import { SUBSCRIPTION_EVENT_TYPES, dispatchMobbexSubscriptionEvent } from './mobbexSubscriptionEventHandlers.js';
import { UnauthorizedError, ValidationError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export default fp(async function mobbexWebhookRoutes(fastify: FastifyInstance) {
  const webhookSecret = mobbexConfig.webhookSecret;

  if (!webhookSecret) {
    throw new Error(
      'MOBBEX_WEBHOOK_SECRET environment variable is missing. ' +
        'Set it before starting the services application.',
    );
  }

  const repository = new MobbexBillingSyncRepository(db);

  // Capture raw body as Buffer so we can parse it after secret verification.
  // This content-type parser is scoped to this plugin only.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post<{ Querystring: { secret?: string } }>(
    '/webhooks/billing/mobbex',
    async (request, reply) => {
      // Secret verification (R004, R005)
      const incomingSecret = request.query.secret;
      if (!incomingSecret || incomingSecret !== webhookSecret) {
        throw new UnauthorizedError();
      }

      // Parse raw body (R006)
      const rawBody = request.body as Buffer;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;
      } catch (parseErr) {
        // R006, EC006: log the parse failure before throwing so traces are complete
        logger.warn({ err: parseErr }, 'mobbexWebhookRoutes: failed to parse request body as JSON');
        throw new ValidationError('Request body is not valid JSON');
      }

      // Extract fields for logging before dispatch (NF002, NF003)
      const data = (payload['data'] as Record<string, unknown> | undefined) ?? {};
      const eventType =
        (payload['type'] as string | undefined) ??
        (payload['event_type'] as string | undefined) ??
        '';
      const providerTransactionId = (data['id'] as string | undefined) ?? null;
      const providerRefundId = (data['refund_id'] as string | undefined) ?? null;
      const refundAmount = (data['amount'] as number | undefined) ?? null;

      // Dispatch to handlers (R002, R003, R007-R011, EC001-EC006)
      const outcome = SUBSCRIPTION_EVENT_TYPES.has(eventType)
        ? await dispatchMobbexSubscriptionEvent(payload, repository)
        : await dispatchMobbexEvent(payload, repository);

      // Structured log (NF002, NF003) — no secret, no full payload, no PII
      request.log.info(
        {
          event_type: eventType,
          provider_transaction_id: providerTransactionId,
          provider_refund_id: providerRefundId,
          amount: refundAmount,
          outcome,
        },
        'mobbex webhook processed',
      );

      // Always respond HTTP 200 on success (R012)
      return reply.status(200).send({ received: true });
    },
  );
});
