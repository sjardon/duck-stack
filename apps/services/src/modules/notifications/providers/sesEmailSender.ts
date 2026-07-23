import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { notificationsConfig } from '../../../shared/configs/notificationsConfig.js';
import type { EmailMessage, IEmailSender } from './interfaces/iEmailSender.js';

// SES SDK error names that represent a permanent, non-retriable failure
// (invalid recipient, unverified sender domain/identity, misconfigured configuration set).
const PERMANENT_SES_ERROR_NAMES = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'ConfigurationSetDoesNotExistException',
]);

export class SesEmailSender implements IEmailSender {
  constructor(private readonly sesClient: SESClient) {}

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    try {
      const response = await this.sesClient.send(
        new SendEmailCommand({
          Source: notificationsConfig.sesFromAddress,
          Destination: { ToAddresses: [message.to] },
          Message: {
            Subject: { Data: message.subject },
            Body: { Html: { Data: message.html } },
          },
          // R002/R003: required for SES to publish any delivery-event notification to SNS at all.
          ConfigurationSetName: notificationsConfig.sesConfigurationSetName,
        }),
      );

      return { providerMessageId: response.MessageId! };
    } catch (err) {
      const name = err instanceof Error ? err.name : undefined;

      if (name && PERMANENT_SES_ERROR_NAMES.has(name)) {
        // warn for DomainError 4xx per BACKEND.md's error handling rules.
        logger.warn({ err }, 'SesEmailSender.send: permanent provider error');
        throw new ProviderError('SES rejected the email as a permanent failure', 400, err);
      }

      logger.error({ err }, 'SesEmailSender.send: transient provider error');
      throw new ProviderError('SES delivery failed transiently', 502, err);
    }
  }
}
