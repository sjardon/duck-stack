import type { EmailMessage, IEmailSender } from '../../src/modules/notifications/providers/interfaces/iEmailSender.js';

export class FakeEmailSender implements IEmailSender {
  public readonly calls: EmailMessage[] = [];
  private readonly error?: Error;

  constructor(error?: Error) {
    this.error = error;
  }

  async send(message: EmailMessage): Promise<void> {
    this.calls.push(message);
    if (this.error) {
      throw this.error;
    }
  }
}
