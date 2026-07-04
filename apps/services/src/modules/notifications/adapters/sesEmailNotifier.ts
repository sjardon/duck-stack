import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { NotificationsConfig } from '../../../shared/configs/notificationsConfig.js';
import type { IEmailNotifier } from '../ports/iEmailNotifier.js';
import { ProviderError } from '../../../shared/errors.js';

// SES error names that indicate a permanent (validation-style) failure.
// These map to ProviderError(400); all others are treated as transient (502).
const PERMANENT_ERROR_NAMES = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'SendingPausedException',
]);

export class SesEmailNotifier implements IEmailNotifier {
  private readonly client: SESv2Client;

  constructor(private readonly config: NotificationsConfig) {
    this.client = new SESv2Client({ region: config.sesRegion });
  }

  async send(params: { to: string; subject: string; html: string }): Promise<void> {
    const command = new SendEmailCommand({
      FromEmailAddress: this.config.sesFromAddress,
      Destination: { ToAddresses: [params.to] },
      Content: {
        Simple: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: params.html, Charset: 'UTF-8' } },
        },
      },
    });

    try {
      await this.client.send(command);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      if (PERMANENT_ERROR_NAMES.has(name)) {
        throw new ProviderError(`SES permanent error: ${name}`, 400, err);
      }
      throw new ProviderError(`SES transient error: ${name || 'unknown'}`, 502, err);
    }
  }
}
