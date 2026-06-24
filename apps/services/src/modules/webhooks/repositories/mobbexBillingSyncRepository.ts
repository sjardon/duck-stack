import type { Sql, TransactionSql } from 'postgres';
import type { BaseLogger } from 'pino';
import type {
  IMobbexBillingSyncRepository,
  RecordEventInput,
  UpdateTransactionStatusInput,
  UpdateTransactionStatusResult,
  EventOutcome,
  UpsertRefundInput,
  UpsertRefundResult,
  RefundOutcome,
} from './interfaces/iMobbexBillingSyncRepository.js';

export class MobbexBillingSyncRepository implements IMobbexBillingSyncRepository {
  constructor(private readonly sql: Sql) {}

  async recordEvent(input: RecordEventInput, logger: BaseLogger): Promise<void> {
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

  async updateTransactionStatus(input: UpdateTransactionStatusInput, logger: BaseLogger): Promise<UpdateTransactionStatusResult> {
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

  async upsertRefundAndMaybeMarkTransactionRefunded(input: UpsertRefundInput, logger: BaseLogger): Promise<UpsertRefundResult> {
    return this.sql.begin(async (tx) => {
      // Step 1: Resolve parent transaction by provider_transaction_id
      const selectStart = Date.now();
      const txRows = await (tx as unknown as TransactionSql)<Array<{ id: string; amount: number; status: string }>>`
        SELECT id, amount, status
        FROM transactions
        WHERE provider_transaction_id = ${input.providerTransactionId}
        LIMIT 1
      `;
      logger.info(
        { duration: Date.now() - selectStart },
        'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded select transaction',
      );

      // Not found — skip refund insert, caller will record event with transactionId: null
      if (txRows.length === 0) {
        logger.warn(
          { providerTransactionId: input.providerTransactionId, providerRefundId: input.providerRefundId },
          'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded: transaction not found',
        );
        return { outcome: 'unresolved' as RefundOutcome, transactionId: null };
      }

      const transaction = txRows[0];

      // Step 2: Warn when parent transaction is in an anomalous state (EC005)
      if (transaction.status === 'pending') {
        logger.warn(
          { transactionId: transaction.id, providerRefundId: input.providerRefundId, currentStatus: transaction.status },
          'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded: refund arrived for pending transaction',
        );
      }

      // Step 3: Upsert refund row, idempotent on provider_refund_id (R008, EC002)
      const upsertStart = Date.now();
      await (tx as unknown as TransactionSql)`
        INSERT INTO refunds (id, transaction_id, amount, reason, status, provider_refund_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), ${transaction.id}, ${input.amount}, ${input.reason}, ${input.refundStatus}, ${input.providerRefundId}, now(), now())
        ON CONFLICT (provider_refund_id) DO UPDATE
          SET amount = EXCLUDED.amount,
              reason = EXCLUDED.reason,
              status = EXCLUDED.status,
              updated_at = now()
      `;
      logger.info(
        { duration: Date.now() - upsertStart, providerRefundId: input.providerRefundId },
        'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded upsert refund',
      );

      // Step 4: If approved, check cumulative sum and potentially mark transaction as refunded
      if (input.refundStatus === 'approved') {
        const sumStart = Date.now();
        const sumRows = await (tx as unknown as TransactionSql)<Array<{ total_approved: string }>>`
          SELECT COALESCE(SUM(amount), 0) AS total_approved
          FROM refunds
          WHERE transaction_id = ${transaction.id} AND status = 'approved'
        `;
        logger.info(
          { duration: Date.now() - sumStart },
          'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded sum approved',
        );

        const totalApproved = parseFloat(sumRows[0].total_approved);

        // Step 5: Transition parent transaction to 'refunded' when fully covered (R004, EC003)
        if (totalApproved >= transaction.amount && transaction.status !== 'refunded') {
          const updateStart = Date.now();
          await (tx as unknown as TransactionSql)`
            UPDATE transactions
            SET status = 'refunded'
            WHERE id = ${transaction.id}
          `;
          logger.info(
            { duration: Date.now() - updateStart, transactionId: transaction.id },
            'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded transaction marked refunded',
          );
          return { outcome: 'transaction_refunded' as RefundOutcome, transactionId: transaction.id };
        }

        return { outcome: 'refund_approved' as RefundOutcome, transactionId: transaction.id };
      }

      // Step 6: Failed refund — do not touch transaction status (EC004)
      return { outcome: 'refund_failed' as RefundOutcome, transactionId: transaction.id };
    });
  }
}
