import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { EmailNotifier, EmailTemplateId, SendEmailInput } from '@repo/types';
import { renderEmailTemplate } from '../templates/renderEmailTemplate.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { ProviderError } from '../../../shared/errors.js';

// A conservative "looks like an email" check — not full RFC 5322 validation (EC002).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SesEmailNotifierConfig {
  region: string;
  senderEmail: string;
}

export class SesEmailNotifier implements EmailNotifier {
  private readonly client: SESv2Client;
  private readonly senderEmail: string;

  constructor(config: SesEmailNotifierConfig) {
    this.client = new SESv2Client({ region: config.region });
    this.senderEmail = config.senderEmail;
  }

  // Fire-and-forget wrapper (BACKEND.md: async work without a caller-facing await
  // must be guarded). dispatch() is never awaited here and its rejection is
  // swallowed — dispatch() has already logged internally, so no rejection or
  // logging duplication can reach the caller (R001, NF001, NF002).
  send<T extends EmailTemplateId>(input: SendEmailInput<T>): void {
    void this.dispatch(input).catch(() => {
      // Intentionally silent: dispatch() logs before rethrowing. This catch only
      // exists to prevent an unhandled promise rejection.
    });
  }

  private async dispatch<T extends EmailTemplateId>(input: SendEmailInput<T>): Promise<void> {
    const { templateId, to, context } = input;

    // Silent-fail: malformed/missing recipient is non-critical and the caller has
    // already continued (EC002).
    if (!to || !EMAIL_REGEX.test(to)) {
      logger.warn({ templateId }, 'Email send skipped: malformed or missing recipient');
      return;
    }

    const rendered = await renderEmailTemplate(templateId, context);

    // Silent-fail: unregistered template id (R004, EC001).
    if (!rendered) {
      logger.warn({ templateId }, 'Email send skipped: unregistered template id');
      return;
    }

    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.senderEmail,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: rendered.subject },
              Body: {
                Html: { Data: rendered.html },
                Text: { Data: rendered.text },
              },
            },
          },
        }),
      );
    } catch (err) {
      // Adapter error-handling rule: log the original error/stack, then re-throw
      // a typed DomainError (R005, EC003, NF003 — only templateId/err, no PII).
      logger.error({ templateId, err }, 'Failed to send email via SES');
      throw new ProviderError('Failed to send email via SES', 502, err);
    }
  }
}
