import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs';
import { SESClient } from '@aws-sdk/client-ses';
import { logger } from '../../../shared/infrastructure/logger.js';
import { requestContext } from '../../../shared/infrastructure/requestContext.js';
import { notificationsConfig } from '../../../shared/configs/notificationsConfig.js';
import { ProviderError } from '../../../shared/errors.js';
import { EmailSendMessageSchema } from '../dtos/emailSendMessageSchema.js';
import { SesEmailSender } from '../providers/sesEmailSender.js';
import { DeliverEmailUseCase } from '../useCases/deliverEmailUseCase.js';
import { db } from '../../../shared/infrastructure/db.js';
import { EmailDeliveriesDBRepository } from '../../../shared/repositories/emailDeliveriesDBRepository.js';
import type { EmailSendMessage } from '../entities/emailSendMessage.js';

type ParseResult =
  | { success: true; message: EmailSendMessage }
  | { success: false; error: unknown };

export function parseEnvelope(body: string): ParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch (error) {
    return { success: false, error };
  }

  const result = EmailSendMessageSchema.safeParse(parsedJson);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, message: result.data as EmailSendMessage };
}

export async function processMessage(sqsClient: SQSClient, rawMessage: Message): Promise<void> {
  const receiptHandle = rawMessage.ReceiptHandle;
  const body = rawMessage.Body ?? '';

  const parsed = parseEnvelope(body);

  if (!parsed.success) {
    // EC001: a poison message is logged and discarded without retry so it does not block the queue.
    logger.error(
      { err: parsed.error, messageId: rawMessage.MessageId },
      'emailWorker: discarding malformed queue message',
    );
    if (receiptHandle) {
      await sqsClient.send(
        new DeleteMessageCommand({ QueueUrl: notificationsConfig.emailQueueUrl, ReceiptHandle: receiptHandle }),
      );
    }
    return;
  }

  const message = parsed.message;

  await requestContext.run({ requestId: message.requestId }, async () => {
    const sender = new SesEmailSender(new SESClient({ region: notificationsConfig.awsRegion }));
    const deliveries = new EmailDeliveriesDBRepository(db);
    const useCase = new DeliverEmailUseCase(sender, deliveries);

    const startedAt = Date.now();
    const baseLog = { requestId: message.requestId, userId: message.userId, templateId: message.templateId };

    try {
      await useCase.execute(message);
      const duration = Date.now() - startedAt;

      // R007, NF001: only identifiers, result, and duration are logged — never variables/html/subject.
      logger.info({ ...baseLog, result: 'sent', duration }, 'emailWorker: email delivered');

      if (receiptHandle) {
        await sqsClient.send(
          new DeleteMessageCommand({ QueueUrl: notificationsConfig.emailQueueUrl, ReceiptHandle: receiptHandle }),
        );
      }
    } catch (err) {
      const duration = Date.now() - startedAt;

      if (err instanceof ProviderError && err.statusCode === 400) {
        // EC003, R006: permanent errors skip the retry policy and go straight to the DLQ.
        logger.error({ ...baseLog, result: 'permanent_failure', duration }, 'emailWorker: permanent delivery failure');

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: notificationsConfig.emailDeadLetterQueueUrl, MessageBody: body }),
        );
        if (receiptHandle) {
          await sqsClient.send(
            new DeleteMessageCommand({ QueueUrl: notificationsConfig.emailQueueUrl, ReceiptHandle: receiptHandle }),
          );
        }
      } else {
        // EC002, R005, NF002: transient errors are left un-acked; SQS redelivers per the queue's
        // visibility timeout, and the redrive policy moves it to the DLQ once retries are exhausted.
        logger.warn({ ...baseLog, result: 'transient_failure', duration }, 'emailWorker: transient delivery failure');
      }
    }
  });
}

export async function startEmailWorker(): Promise<void> {
  const sqsClient = new SQSClient({ region: notificationsConfig.awsRegion });
  let shuttingDown = false;

  const requestShutdown = () => {
    shuttingDown = true;
  };
  process.on('SIGINT', requestShutdown);
  process.on('SIGTERM', requestShutdown);

  logger.info('emailWorker: started');

  while (!shuttingDown) {
    let response;
    try {
      response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: notificationsConfig.emailQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: notificationsConfig.sqsPollWaitTimeSeconds,
        }),
      );
    } catch (err) {
      // Fire-and-forget async work must not crash the worker on a transient SQS polling error;
      // log and let the loop retry on the next iteration.
      logger.error({ err }, 'emailWorker: failed to poll the queue, will retry');
      continue;
    }

    for (const message of response.Messages ?? []) {
      await processMessage(sqsClient, message);
    }
  }

  logger.info('emailWorker: stopped');
}
