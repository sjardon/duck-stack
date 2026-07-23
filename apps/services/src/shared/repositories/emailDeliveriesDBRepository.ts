import type { Sql } from 'postgres';
import { DomainError, ProviderError } from '../errors.js';
import { logger } from '../infrastructure/logger.js';
import type {
  ApplyDeliveryEventOutcome,
  EmailDeliveryRecord,
  IEmailDeliveriesRepository,
  TerminalEmailDeliveryState,
} from './interfaces/iEmailDeliveriesRepository.js';

export class EmailDeliveriesDBRepository implements IEmailDeliveriesRepository {
  constructor(private readonly sql: Sql) {}

  // Shared try/catch/log/duration boilerplate for every query below: DomainErrors pass through
  // unchanged, any other failure is logged with `context` and wrapped as a 502 ProviderError.
  private async guarded<T>(method: string, context: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'EmailDeliveriesDBRepository', method, ...context },
        `EmailDeliveriesDBRepository.${method} failed`,
      );
      throw new ProviderError(`Database error in EmailDeliveriesDBRepository.${method}`, 502, err);
    }
  }

  // R001: persist a record for the send request in `queued` state, before any dispatch happens.
  async createQueued(input: { id: string; templateId: string; to: string; userId: string | null }): Promise<void> {
    const start = Date.now();
    await this.guarded('createQueued', { id: input.id }, async () => {
      await this.sql`
        INSERT INTO email_deliveries (id, template_id, recipient_email, user_id, state)
        VALUES (${input.id}, ${input.templateId}, ${input.to}, ${input.userId}, 'queued')
      `;
    });
    logger.info({ duration: Date.now() - start }, 'EmailDeliveriesDBRepository.createQueued');
  }

  async findById(id: string): Promise<EmailDeliveryRecord | null> {
    const start = Date.now();
    return this.guarded('findById', { id }, async () => {
      const rows = await this.sql<Array<{ id: string; state: EmailDeliveryRecord['state']; provider_message_id: string | null }>>`
        SELECT id, state, provider_message_id
        FROM email_deliveries
        WHERE id = ${id}
        LIMIT 1
      `;
      logger.info({ duration: Date.now() - start }, 'EmailDeliveriesDBRepository.findById');

      if (rows.length === 0) return null;

      const row = rows[0];
      return { id: row.id, state: row.state, providerMessageId: row.provider_message_id };
    });
  }

  // R002 step 1: idempotent — a retry that reaches this line again is a harmless no-op (EC003).
  async recordProviderMessageId(id: string, providerMessageId: string): Promise<void> {
    const start = Date.now();
    await this.guarded('recordProviderMessageId', { id }, async () => {
      await this.sql`
        UPDATE email_deliveries
        SET provider_message_id = ${providerMessageId}
        WHERE id = ${id}
          AND provider_message_id IS NULL
      `;
    });
    logger.info({ duration: Date.now() - start }, 'EmailDeliveriesDBRepository.recordProviderMessageId');
  }

  // R002 step 2: no-op once already `sent` or moved to a terminal state by the webhook (EC001).
  async markSent(id: string): Promise<void> {
    const start = Date.now();
    await this.guarded('markSent', { id }, async () => {
      await this.sql`
        UPDATE email_deliveries
        SET state = 'sent'
        WHERE id = ${id}
          AND state = 'queued'
      `;
    });
    logger.info({ duration: Date.now() - start }, 'EmailDeliveriesDBRepository.markSent');
  }

  // R004: short-circuit a suppressed recipient's send before the provider is ever called; guarded
  // by `WHERE state = 'queued'` so a redelivered queue message is a harmless no-op.
  async markSuppressed(id: string): Promise<void> {
    const start = Date.now();
    await this.guarded('markSuppressed', { id }, async () => {
      await this.sql`
        UPDATE email_deliveries
        SET state = 'suppressed'
        WHERE id = ${id}
          AND state = 'queued'
      `;
    });
    logger.info({ duration: Date.now() - start }, 'EmailDeliveriesDBRepository.markSuppressed');
  }

  // R003, NF001, EC001, EC002, EC004: guarded UPDATE keyed on provider_message_id; a follow-up
  // SELECT distinguishes not_found from already_terminal purely for the log line.
  async applyDeliveryEventByProviderMessageId(
    providerMessageId: string,
    state: TerminalEmailDeliveryState,
  ): Promise<ApplyDeliveryEventOutcome> {
    const start = Date.now();
    return this.guarded('applyDeliveryEventByProviderMessageId', { providerMessageId }, async () => {
      const updated = await this.sql<Array<{ id: string }>>`
        UPDATE email_deliveries
        SET state = ${state}
        WHERE provider_message_id = ${providerMessageId}
          AND state NOT IN ('delivered', 'bounced', 'complained', 'failed')
        RETURNING id
      `;
      logger.info(
        { duration: Date.now() - start },
        'EmailDeliveriesDBRepository.applyDeliveryEventByProviderMessageId',
      );

      if (updated.length > 0) {
        return 'applied';
      }

      const existing = await this.sql<Array<{ id: string }>>`
        SELECT id FROM email_deliveries WHERE provider_message_id = ${providerMessageId} LIMIT 1
      `;

      return existing.length > 0 ? 'already_terminal' : 'not_found';
    });
  }
}
