import crypto from 'node:crypto';
import type { EmailSendRequest, EmailTemplateId } from '@repo/types';
import type { ISqsEmailQueue } from '../ports/iSqsEmailQueue.js';
import { templateRegistry } from '../templates/templateRegistry.js';
import { ValidationError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class SendEmailUseCase {
  constructor(private readonly queue: ISqsEmailQueue) {}

  async execute<T extends EmailTemplateId>(req: EmailSendRequest<T>): Promise<void> {
    const start = Date.now();

    if (!(req.templateId in templateRegistry)) {
      throw new ValidationError(`Unknown email template: "${req.templateId}"`);
    }

    const requestId = req.requestId ?? crypto.randomUUID();

    await this.queue.enqueue({
      requestId,
      userId: req.userId,
      templateId: req.templateId,
      to: req.to,
      variables: req.variables as Record<string, unknown>,
      enqueuedAt: new Date().toISOString(),
    });

    logger.info(
      {
        requestId,
        userId: req.userId,
        templateId: req.templateId,
        outcome: 'enqueued',
        duration: Date.now() - start,
      },
      'email send enqueued',
    );
  }
}
