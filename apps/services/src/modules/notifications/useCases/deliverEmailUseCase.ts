import { logger } from '../../../shared/infrastructure/logger.js';
import { DomainError } from '../../../shared/errors.js';
import { emailTemplateRegistry } from '../templates/emailTemplateRegistry.js';
import type { EmailSendMessage } from '../entities/emailSendMessage.js';
import type { IEmailSender } from '../providers/interfaces/iEmailSender.js';

export class DeliverEmailUseCase {
  constructor(private readonly sender: IEmailSender) {}

  async execute(message: EmailSendMessage): Promise<void> {
    const template = emailTemplateRegistry[message.templateId];

    try {
      const subject = template.subject(message.variables);
      const html = await template.render(message.variables);

      await this.sender.send({ to: message.to, subject, html });
    } catch (err) {
      // NF001: only identifiers are logged — never variables/subject/html.
      // warn for DomainError 4xx; error for DomainError >= 500 and any non-DomainError,
      // per BACKEND.md's error handling rules.
      const logFields = { err, requestId: message.requestId, templateId: message.templateId };
      if (err instanceof DomainError && err.statusCode < 500) {
        logger.warn(logFields, 'DeliverEmailUseCase.execute: delivery failed');
      } else {
        logger.error(logFields, 'DeliverEmailUseCase.execute: delivery failed');
      }
      throw err;
    }
  }
}
