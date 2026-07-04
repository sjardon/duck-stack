import { notificationsConfig } from '../../shared/configs/notificationsConfig.js';
import { SesEmailNotifier } from './adapters/sesEmailNotifier.js';
import { SqsEmailQueue } from './adapters/sqsEmailQueue.js';
import { EmailSendMessageSchema } from './dtos/emailSendMessageDto.js';
import type { IEmailNotifier } from './ports/iEmailNotifier.js';
import type { ISqsEmailQueue, SqsEnvelope } from './ports/iSqsEmailQueue.js';
import { templateRegistry } from './templates/templateRegistry.js';
import { ProviderError } from '../../shared/errors.js';
import { logger } from '../../shared/infrastructure/logger.js';

/**
 * Process a single SQS envelope: parse, render, dispatch, and acknowledge or retry.
 * Exported for unit testing — the poll loop calls this per message.
 */
export async function processMessage(
  envelope: SqsEnvelope,
  queue: ISqsEmailQueue,
  notifier: IEmailNotifier,
): Promise<void> {
  const start = Date.now();
  const { messageId, receiptHandle, body } = envelope;

  // EC001 — parse step: catch deserialization failures and discard the poison message
  let parsed: ReturnType<typeof EmailSendMessageSchema.parse> | undefined;
  try {
    const raw: unknown = JSON.parse(body);
    parsed = EmailSendMessageSchema.parse(raw);
  } catch (err) {
    logger.error(
      { messageId, outcome: 'parse_error', error: String(err), duration: Date.now() - start },
      'worker: discarding unparseable message',
    );
    await queue.delete(receiptHandle);
    return;
  }

  const { requestId, userId, templateId, to, variables } = parsed;

  const entry = templateRegistry[templateId as keyof typeof templateRegistry];
  if (!entry) {
    // Unknown template — treat as permanent failure, discard without retry
    logger.error(
      { messageId, requestId, templateId, outcome: 'permanent_failure', duration: Date.now() - start },
      'worker: unknown templateId, discarding message',
    );
    await queue.delete(receiptHandle);
    return;
  }

  let html: string;
  try {
    html = await entry.render(variables as never);
  } catch (err) {
    // Template render error — treat as permanent failure
    logger.error(
      { messageId, requestId, templateId, outcome: 'permanent_failure', error: String(err), duration: Date.now() - start },
      'worker: template render failed, discarding message',
    );
    await queue.delete(receiptHandle);
    return;
  }

  try {
    await notifier.send({ to, subject: entry.subject, html });

    // Success — acknowledge the message
    await queue.delete(receiptHandle);
    logger.info(
      {
        requestId,
        userId,
        templateId,
        outcome: 'dispatched',
        duration: Date.now() - start,
      },
      'worker: email dispatched',
    );
  } catch (err) {
    if (err instanceof ProviderError && err.statusCode === 502) {
      // EC002 — transient error: leave message unacknowledged so SQS redelivers it
      logger.warn(
        {
          requestId,
          userId,
          templateId,
          outcome: 'retry',
          duration: Date.now() - start,
        },
        'worker: transient provider error, message will be retried',
      );
    } else {
      // EC003 — permanent error: delete to prevent infinite retry; SQS DLQ also catches exhausted messages
      logger.error(
        {
          messageId,
          requestId,
          userId,
          templateId,
          outcome: 'permanent_failure',
          duration: Date.now() - start,
        },
        'worker: permanent provider error, discarding message',
      );
      await queue.delete(receiptHandle);
    }
  }
}

// ── Entrypoint (NF003) ───────────────────────────────────────────────────────

let running = true;

async function pollLoop(queue: ISqsEmailQueue, notifier: IEmailNotifier): Promise<void> {
  logger.info({ outcome: 'started' }, 'worker: poll loop started');

  while (running) {
    let envelopes: SqsEnvelope[];
    try {
      envelopes = await queue.receive();
    } catch (err) {
      logger.error({ error: String(err) }, 'worker: receive() failed, retrying after interval');
      await sleep(notificationsConfig.sqsPollingIntervalMs);
      continue;
    }

    // Process messages sequentially to avoid overloading the provider and simplify error handling
    for (const envelope of envelopes) {
      if (!running) break;
      await processMessage(envelope, queue, notifier);
    }

    // When the queue returned fewer messages than requested, back off before the next poll
    if (envelopes.length < notificationsConfig.sqsMaxMessages) {
      await sleep(notificationsConfig.sqsPollingIntervalMs);
    }
  }

  logger.info({ outcome: 'stopped' }, 'worker: poll loop stopped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gracefulShutdown(signal: string): void {
  logger.info({ signal }, 'worker: shutdown signal received, draining current batch');
  running = false;
}

// Only start the poll loop when running as the main entrypoint, not when imported for tests.
if (require.main === module) {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  const queue = new SqsEmailQueue(notificationsConfig);
  const notifier = new SesEmailNotifier(notificationsConfig);

  pollLoop(queue, notifier).catch((err) => {
    logger.error({ error: String(err) }, 'worker: fatal error in poll loop');
    process.exit(1);
  });
}
