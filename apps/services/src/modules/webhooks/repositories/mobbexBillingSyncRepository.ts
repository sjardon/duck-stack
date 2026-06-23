import type { Sql, TransactionSql } from 'postgres';
import type {
  IMobbexBillingSyncRepository,
  RecordEventInput,
  UpdateTransactionStatusInput,
  UpdateTransactionStatusResult,
  EventOutcome,
} from './interfaces/iMobbexBillingSyncRepository.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class MobbexBillingSyncRepository implements IMobbexBillingSyncRepository {
  constructor(private readonly sql: Sql) {}

  async recordEvent(input: RecordEventInput): Promise<void> {
    const start = Date.now();
    await this.sql`
      INSERT INTO billing_webhook_events (provider, event_type, payload, received_at, transaction_id)
      VALUES (
        'mobbex',
        ${input.eventType},
        ${this.sql.json(input.payload as unknown as Parameters<Sql['json']>[0])},
        now(),
        ${input.transactionId}
      )
    `;
    logger.info({ duration: Date.now() - start }, 'MobbexBillingSyncRepository.recordEvent');
  }

  async updateTransactionStatus(input: UpdateTransactionStatusInput): Promise<UpdateTransactionStatusResult> {
    return this.sql.begin(async (tx) => {
      // Step 1: Resolve transaction by provider_transaction_id first, fall back to reference
      let rows: Array<{ id: string; status: string }> = [];

      if (input.providerTransactionId) {
        const selectStart = Date.now();
        rows = await (tx as unknown as TransactionSql)<Array<{ id: string; status: string }>>`
          SELECT id, status
          FROM transactions
          WHERE provider_transaction_id = ${input.providerTransactionId}
          LIMIT 1
        `;
        logger.info(
          { duration: Date.now() - selectStart },
          'MobbexBillingSyncRepository.updateTransactionStatus select by provider_transaction_id',
        );
      }

      if (rows.length === 0 && input.reference) {
        const selectStart = Date.now();
        rows = await (tx as unknown as TransactionSql)<Array<{ id: string; status: string }>>`
          SELECT id, status
          FROM transactions
          WHERE reference = ${input.reference}
          LIMIT 1
        `;
        logger.info(
          { duration: Date.now() - selectStart },
          'MobbexBillingSyncRepository.updateTransactionStatus select by reference',
        );
      }

      // Step 2: No matching transaction found
      if (rows.length === 0) {
        logger.warn(
          {
            providerTransactionId: input.providerTransactionId,
            reference: input.reference,
          },
          'MobbexBillingSyncRepository.updateTransactionStatus: transaction not found',
        );
        return { outcome: 'unresolved' as EventOutcome, transactionId: null };
      }

      const transaction = rows[0];

      // Step 3: Idempotency check — skip UPDATE if status already matches
      if (transaction.status === input.status) {
        logger.info(
          { transactionId: transaction.id, status: input.status },
          'MobbexBillingSyncRepository.updateTransactionStatus: noop — status already matches',
        );
        return { outcome: 'noop' as EventOutcome, transactionId: transaction.id };
      }

      // Step 4: Update status (and failure_reason when applicable)
      const updateStart = Date.now();
      if (input.status === 'failed' && input.failureReason !== undefined) {
        await (tx as unknown as TransactionSql)`
          UPDATE transactions
          SET status = ${input.status},
              failure_reason = ${input.failureReason}
          WHERE id = ${transaction.id}
        `;
      } else {
        await (tx as unknown as TransactionSql)`
          UPDATE transactions
          SET status = ${input.status}
          WHERE id = ${transaction.id}
        `;
      }
      logger.info(
        { duration: Date.now() - updateStart, transactionId: transaction.id, status: input.status },
        'MobbexBillingSyncRepository.updateTransactionStatus update',
      );

      return { outcome: input.status as EventOutcome, transactionId: transaction.id };
    });
  }
}
