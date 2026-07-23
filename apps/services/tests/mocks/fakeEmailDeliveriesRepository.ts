import type {
  ApplyDeliveryEventOutcome,
  EmailDeliveryRecord,
  IEmailDeliveriesRepository,
  TerminalEmailDeliveryState,
} from '../../src/shared/repositories/interfaces/iEmailDeliveriesRepository.js';

const TERMINAL_STATES = new Set<string>(['delivered', 'bounced', 'complained', 'failed']);

export class FakeEmailDeliveriesRepository implements IEmailDeliveriesRepository {
  private readonly recordsById = new Map<string, EmailDeliveryRecord>();

  async createQueued(input: { id: string; templateId: string; to: string; userId: string | null }): Promise<void> {
    this.recordsById.set(input.id, {
      id: input.id,
      state: 'queued',
      providerMessageId: null,
    });
  }

  async findById(id: string): Promise<EmailDeliveryRecord | null> {
    const record = this.recordsById.get(id);
    return record ? { ...record } : null;
  }

  async recordProviderMessageId(id: string, providerMessageId: string): Promise<void> {
    const record = this.recordsById.get(id);
    if (!record || record.providerMessageId !== null) {
      return;
    }
    record.providerMessageId = providerMessageId;
  }

  async markSent(id: string): Promise<void> {
    const record = this.recordsById.get(id);
    if (!record || record.state !== 'queued') {
      return;
    }
    record.state = 'sent';
  }

  async applyDeliveryEventByProviderMessageId(
    providerMessageId: string,
    state: TerminalEmailDeliveryState,
  ): Promise<ApplyDeliveryEventOutcome> {
    const record = [...this.recordsById.values()].find((r) => r.providerMessageId === providerMessageId);
    if (!record) {
      return 'not_found';
    }
    if (TERMINAL_STATES.has(record.state)) {
      return 'already_terminal';
    }
    record.state = state;
    return 'applied';
  }
}
