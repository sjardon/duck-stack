import { Resend } from 'resend';
import type { EmailNotifier, EmailTemplateId, SendEmailInput } from '@repo/types';
import { renderEmailTemplate } from '../templates/renderEmailTemplate.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { ProviderError } from '../../../shared/errors.js';
import { requestContext } from '../../../shared/infrastructure/requestContext.js';
import { errorReporter } from '../../../shared/providers/errorReporter.js';

// A conservative "looks like an email" check — not full RFC 5322 validation (EC002).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ResendEmailNotifierConfig {
  apiKey: string;
  senderEmail: string;
}

export class ResendEmailNotifier implements EmailNotifier {
  private readonly client: Resend;
  private readonly senderEmail: string;

  constructor(config: ResendEmailNotifierConfig) {
    this.client = new Resend(config.apiKey);
    this.senderEmail = config.senderEmail;
  }

  // Fire-and-forget wrapper (BACKEND.md: async work without a caller-facing await
  // must be guarded). dispatch() is never awaited here and its rejection is
  // swallowed — dispatch() has already logged internally, so no rejection or
  // logging duplication can reach the caller (R001, NF001, NF002).
  send<T extends EmailTemplateId>(input: SendEmailInput<T>): void {
    void this.dispatch(input).catch((err: unknown) => {
      // dispatch() has already logged internally; this catch's only remaining
      // job is to close the blind spot on a caught-and-stopped failure by
      // reporting it explicitly before swallowing the rejection.
      errorReporter.report(err, { requestId: requestContext.getStore()?.requestId });
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
      const { error } = await this.client.emails.send({
        from: this.senderEmail,
        to: [to],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      // Resend does not reject on API-level failures (invalid API key,
      // unverified domain, rate limit) — it resolves with a truthy `error`
      // field instead. Bridge that shape into the catch below so both failure
      // modes funnel through the same adapter error-handling path.
      if (error) {
        throw error;
      }
    } catch (err) {
      // Adapter error-handling rule: log the original error/stack, then re-throw
      // a typed DomainError (R005, EC001-EC003, NF003 — only templateId/err, no PII).
      logger.error({ templateId, err }, 'Failed to send email via Resend');
      throw new ProviderError('Failed to send email via Resend', 502, err);
    }
  }
}
