import type { FastifyInstance } from 'fastify';
import { notificationsConfig } from '../../../shared/configs/notificationsConfig.js';
import { db } from '../../../shared/infrastructure/db.js';
import { EmailDeliveriesDBRepository } from '../../../shared/repositories/emailDeliveriesDBRepository.js';
import { EmailSuppressionsDBRepository } from '../../../shared/repositories/emailSuppressionsDBRepository.js';
import type { IEmailDeliveriesRepository } from '../../../shared/repositories/interfaces/iEmailDeliveriesRepository.js';
import type { IEmailSuppressionsRepository } from '../../../shared/repositories/interfaces/iEmailSuppressionsRepository.js';
import { UnauthorizedError, ValidationError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { SnsNotificationSchema, type SnsNotificationDto } from './dtos/snsNotificationSchema.js';
import { SesEventSchema } from './dtos/sesEventSchema.js';
import { validateSnsMessage } from './snsSignatureValidator.js';
import { dispatchSesEvent } from './sesEventHandlers.js';

function parseNotificationBody(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString('utf-8'));
  } catch (err) {
    logger.warn({ err }, 'sesEventsWebhookRoutes: failed to parse request body as JSON');
    throw new ValidationError('Request body is not valid JSON');
  }
}

function parseEnvelope(parsedJson: unknown): SnsNotificationDto {
  const result = SnsNotificationSchema.safeParse(parsedJson);
  if (!result.success) {
    logger.warn({ err: result.error }, 'sesEventsWebhookRoutes: invalid SNS envelope shape');
    throw new ValidationError('Invalid SNS notification envelope');
  }
  return result.data;
}

// R004: authenticate the notification as coming from the provider before processing any content.
async function authenticateEnvelope(envelope: SnsNotificationDto, topicArn: string): Promise<SnsNotificationDto> {
  let validated: SnsNotificationDto;
  try {
    validated = (await validateSnsMessage(envelope)) as SnsNotificationDto;
  } catch (err) {
    logger.warn({ err }, 'sesEventsWebhookRoutes: SNS signature verification failed');
    throw new UnauthorizedError(err instanceof Error ? err : undefined);
  }

  // Defense-in-depth: reject notifications for any topic other than the one we expect.
  if (validated.TopicArn !== topicArn) {
    logger.warn({ topicArn: validated.TopicArn }, 'sesEventsWebhookRoutes: unexpected TopicArn');
    throw new UnauthorizedError();
  }

  return validated;
}

// Required plumbing for R003 — without completing the handshake, the topic never delivers real
// notifications to this endpoint.
async function confirmSubscription(validated: SnsNotificationDto): Promise<void> {
  if (validated.SubscribeURL) {
    await fetch(validated.SubscribeURL);
  }
}

async function processNotification(
  validated: SnsNotificationDto,
  repository: IEmailDeliveriesRepository,
  suppressions: IEmailSuppressionsRepository,
): Promise<void> {
  try {
    const innerEvent = SesEventSchema.parse(JSON.parse(validated.Message));
    await dispatchSesEvent(innerEvent, repository, suppressions);
  } catch (err) {
    // EC002/EC004-adjacent: malformed inner content is logged and discarded, never an error response.
    logger.warn({ err }, 'sesEventsWebhookRoutes: failed to process inner SES event');
  }
}

export default async function sesEventsWebhookRoutes(fastify: FastifyInstance) {
  const topicArn = notificationsConfig.sesEventsTopicArn;

  if (!topicArn) {
    throw new Error(
      'NOTIFICATIONS_SES_EVENTS_TOPIC_ARN environment variable is missing. ' +
        'Set it before starting the services application.',
    );
  }

  const repository = new EmailDeliveriesDBRepository(db);
  const suppressions = new EmailSuppressionsDBRepository(db);

  // SNS posts with Content-Type: text/plain, not application/json — capture the raw body as a
  // Buffer so it can be parsed after signature verification. Scoped to this plugin only.
  fastify.addContentTypeParser('text/plain', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/webhooks/notifications/ses', async (request, reply) => {
    const parsedJson = parseNotificationBody(request.body as Buffer);
    const envelope = parseEnvelope(parsedJson);
    const validated = await authenticateEnvelope(envelope, topicArn);

    if (validated.Type === 'SubscriptionConfirmation' || validated.Type === 'UnsubscribeConfirmation') {
      await confirmSubscription(validated);
      return reply.status(200).send({ received: true });
    }

    if (validated.Type === 'Notification') {
      await processNotification(validated, repository, suppressions);
    }

    // R003, EC001, EC002, EC004: always reply 200 for authenticated notifications, regardless
    // of the dispatch outcome — the authentication failures above are the only error responses.
    return reply.status(200).send({ received: true });
  });
}
