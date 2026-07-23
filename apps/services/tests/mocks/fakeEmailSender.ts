import type { EmailMessage, IEmailSender } from '../../src/modules/notifications/providers/interfaces/iEmailSender.js';

export class FakeEmailSender implements IEmailSender {
  public readonly calls: EmailMessage[] = [];
  private readonly error?: Error;
  private readonly providerMessageId: string;

  constructor(error?: Error, providerMessageId = 'fake-provider-message-id') {
    this.error = error;
    this.providerMessageId = providerMessageId;
  }

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    this.calls.push(message);
    if (this.error) {
      throw this.error;
    }
    return { providerMessageId: this.providerMessageId };
  }
}
