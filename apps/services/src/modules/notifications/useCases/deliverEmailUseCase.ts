import { logger } from '../../../shared/infrastructure/logger.js';
import { DomainError } from '../../../shared/errors.js';
import { emailTemplateRegistry } from '../templates/emailTemplateRegistry.js';
import type { EmailSendMessage } from '../entities/emailSendMessage.js';
import type { IEmailSender } from '../providers/interfaces/iEmailSender.js';
import type { IEmailDeliveriesRepository } from '../../../shared/repositories/interfaces/iEmailDeliveriesRepository.js';
import type { IEmailSuppressionsRepository } from '../../../shared/repositories/interfaces/iEmailSuppressionsRepository.js';

export class DeliverEmailUseCase {
  constructor(
    private readonly sender: IEmailSender,
    private readonly deliveries: IEmailDeliveriesRepository,
    private readonly suppressions: IEmailSuppressionsRepository,
  ) {}

  async execute(message: EmailSendMessage): Promise<void> {
    if (await this.wasAlreadyDispatched(message.sendId)) {
      // R005, EC003: a prior attempt already got an id from the provider — do not call it again,
      // just (re)attempt the state transition, which is itself idempotent (markSent's WHERE guard).
      await this.deliveries.markSent(message.sendId);
      return;
    }

    await this.dispatch(message);
  }

  private async wasAlreadyDispatched(sendId: string): Promise<boolean> {
    const existing = await this.deliveries.findById(sendId);
    return existing?.providerMessageId != null;
  }

  // R003, R004, EC002, EC004: checked at dispatch/processing time (not enqueue time), so an
  // address suppressed after this message was published is still caught here; each message has
  // its own sendId/row, so concurrent sends to the same address each resolve independently.
  private async isSuppressedRecipient(message: EmailSendMessage): Promise<boolean> {
    if (!(await this.suppressions.isSuppressed(message.to))) return false;

    await this.deliveries.markSuppressed(message.sendId);
    return true;
  }

  private async dispatch(message: EmailSendMessage): Promise<void> {
    if (await this.isSuppressedRecipient(message)) return;

    const template = emailTemplateRegistry[message.templateId];

    try {
      const subject = template.subject(message.variables);
      const html = await template.render(message.variables);

      const { providerMessageId } = await this.sender.send({ to: message.to, subject, html });

      // R002: two independent, idempotent writes — recordProviderMessageId must land before
      // markSent so a crash between the two still leaves the provider id durable (EC003).
      await this.deliveries.recordProviderMessageId(message.sendId, providerMessageId);
      await this.deliveries.markSent(message.sendId);
    } catch (err) {
      this.logDeliveryFailure(err, message);
      throw err;
    }
  }

  // NF001: only identifiers are logged — never variables/subject/html.
  // warn for DomainError 4xx; error for DomainError >= 500 and any non-DomainError,
  // per BACKEND.md's error handling rules.
  private logDeliveryFailure(err: unknown, message: EmailSendMessage): void {
    const logFields = { err, requestId: message.requestId, templateId: message.templateId };
    if (err instanceof DomainError && err.statusCode < 500) {
      logger.warn(logFields, 'DeliverEmailUseCase.execute: delivery failed');
    } else {
      logger.error(logFields, 'DeliverEmailUseCase.execute: delivery failed');
    }
  }
}
