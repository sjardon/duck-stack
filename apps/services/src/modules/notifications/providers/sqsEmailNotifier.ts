import { randomUUID } from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ProviderError, ValidationError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { requestContext } from '../../../shared/infrastructure/requestContext.js';
import { isKnownEmailTemplate, type EmailTemplateId, type EmailTemplateVariables } from '../templates/emailTemplateRegistry.js';
import type { EmailSendMessage } from '../entities/emailSendMessage.js';
import type { IEmailNotifier } from './interfaces/iEmailNotifier.js';
import type { IEmailDeliveriesRepository } from '../../../shared/repositories/interfaces/iEmailDeliveriesRepository.js';

export class SqsEmailNotifier implements IEmailNotifier {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly queueUrl: string,
    private readonly deliveries: IEmailDeliveriesRepository,
  ) {}

  async send<K extends EmailTemplateId>(
    templateId: K,
    variables: EmailTemplateVariables[K],
    recipient: { to: string; userId?: string },
  ): Promise<void> {
    // R008: reject unknown template ids before enqueuing
    if (!isKnownEmailTemplate(templateId)) {
      throw new ValidationError(`Unknown email template id: "${templateId}"`);
    }

    // Correlates with the request that triggered the send when available (R003, R007);
    // falls back to a freshly generated id for sends issued outside an HTTP request.
    const requestId = requestContext.getStore()?.requestId ?? randomUUID();

    // R001, NF003: unique per send — the primary key of its email_deliveries row.
    const sendId = randomUUID();

    // R001, NF003: the row must exist before the message can possibly be dequeued.
    // Awaited before enqueueing so a persistence failure aborts the send before it is ever queued.
    await this.deliveries.createQueued({
      id: sendId,
      templateId,
      to: recipient.to,
      userId: recipient.userId ?? null,
    });

    const message: EmailSendMessage<K> = {
      sendId,
      requestId,
      templateId,
      variables,
      to: recipient.to,
      userId: recipient.userId,
    };

    await this.enqueue(message);
  }

  private async enqueue<K extends EmailTemplateId>(message: EmailSendMessage<K>): Promise<void> {
    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );
    } catch (err) {
      logger.error(
        { err, requestId: message.requestId, sendId: message.sendId, templateId: message.templateId },
        'SqsEmailNotifier.send: failed to enqueue message',
      );
      throw new ProviderError('Failed to enqueue email send request', 502, err);
    }
  }
}
