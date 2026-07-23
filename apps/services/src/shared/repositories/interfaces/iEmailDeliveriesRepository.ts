export type EmailDeliveryState = 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';
export type TerminalEmailDeliveryState = 'delivered' | 'bounced' | 'complained' | 'failed';
export type ApplyDeliveryEventOutcome = 'applied' | 'not_found' | 'already_terminal';

export interface EmailDeliveryRecord {
  id: string;
  state: EmailDeliveryState;
  providerMessageId: string | null;
}

export interface IEmailDeliveriesRepository {
  createQueued(input: { id: string; templateId: string; to: string; userId: string | null }): Promise<void>;
  findById(id: string): Promise<EmailDeliveryRecord | null>;
  recordProviderMessageId(id: string, providerMessageId: string): Promise<void>;
  markSent(id: string): Promise<void>;
  applyDeliveryEventByProviderMessageId(
    providerMessageId: string,
    state: TerminalEmailDeliveryState,
  ): Promise<ApplyDeliveryEventOutcome>;
}
