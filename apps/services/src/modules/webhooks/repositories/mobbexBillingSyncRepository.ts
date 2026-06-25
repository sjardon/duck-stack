import type { Sql, TransactionSql } from 'postgres';
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
import { DomainError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class MobbexBillingSyncRepository implements IMobbexBillingSyncRepository {
  constructor(private readonly sql: Sql) {}

  async recordEvent(input: RecordEventInput): Promise<void> {
    const start = Date.now();
    try {
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
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'MobbexBillingSyncRepository', method: 'recordEvent' },
        'MobbexBillingSyncRepository.recordEvent failed',
      );
      throw new ProviderError('Database error in MobbexBillingSyncRepository.recordEvent', 502, err);
    }
  }

  async updateTransactionStatus(input: UpdateTransactionStatusInput): Promise<UpdateTransactionStatusResult> {
    try {
      return await this.sql.begin(async (tx) => {
        // Step 1: Resolve transaction by provider_transaction_id first, fall back to reference
        let rows: Array<{ id: string; status: string }> = [];

        if (input.providerTransactionId) {
          let selectResult: Array<{ id: string; status: string }>;
          try {
            const selectStart = Date.now();
            selectResult = await (tx as unknown as TransactionSql)<Array<{ id: string; status: string }>>`
              SELECT id, status
              FROM transactions
              WHERE provider_transaction_id = ${input.providerTransactionId}
              LIMIT 1
            `;
            logger.info(
              { duration: Date.now() - selectStart },
              'MobbexBillingSyncRepository.updateTransactionStatus select by provider_transaction_id',
            );
          } catch (err: unknown) {
            if (err instanceof DomainError) throw err;
            logger.error(
              { err, repository: 'MobbexBillingSyncRepository', method: 'updateTransactionStatus', step: 'select by provider_transaction_id' },
              'MobbexBillingSyncRepository.updateTransactionStatus select by provider_transaction_id failed',
            );
            throw new ProviderError('Database error in MobbexBillingSyncRepository.updateTransactionStatus', 502, err);
          }
          rows = selectResult;
        }

        if (rows.length === 0 && input.reference) {
          let selectResult: Array<{ id: string; status: string }>;
          try {
            const selectStart = Date.now();
            selectResult = await (tx as unknown as TransactionSql)<Array<{ id: string; status: string }>>`
              SELECT id, status
              FROM transactions
              WHERE reference = ${input.reference}
              LIMIT 1
            `;
            logger.info(
              { duration: Date.now() - selectStart },
              'MobbexBillingSyncRepository.updateTransactionStatus select by reference',
            );
          } catch (err: unknown) {
            if (err instanceof DomainError) throw err;
            logger.error(
              { err, repository: 'MobbexBillingSyncRepository', method: 'updateTransactionStatus', step: 'select by reference', reference: input.reference },
              'MobbexBillingSyncRepository.updateTransactionStatus select by reference failed',
            );
            throw new ProviderError('Database error in MobbexBillingSyncRepository.updateTransactionStatus', 502, err);
          }
          rows = selectResult;
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
        try {
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
        } catch (err: unknown) {
          if (err instanceof DomainError) throw err;
          logger.error(
            { err, repository: 'MobbexBillingSyncRepository', method: 'updateTransactionStatus', step: 'update status' },
            'MobbexBillingSyncRepository.updateTransactionStatus update failed',
          );
          throw new ProviderError('Database error in MobbexBillingSyncRepository.updateTransactionStatus', 502, err);
        }

        return { outcome: input.status as EventOutcome, transactionId: transaction.id };
      });
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      // Safety net: catches errors from sql.begin itself (not sub-query bodies)
      logger.error(
        { err, repository: 'MobbexBillingSyncRepository', method: 'updateTransactionStatus' },
        'MobbexBillingSyncRepository.updateTransactionStatus failed',
      );
      throw new ProviderError('Database error in MobbexBillingSyncRepository.updateTransactionStatus', 502, err);
    }
  }

  async upsertRefundAndMaybeMarkTransactionRefunded(input: UpsertRefundInput): Promise<UpsertRefundResult> {
    try {
      return await this.sql.begin(async (tx) => {
        // Step 1: Resolve parent transaction by provider_transaction_id
        let txRows: Array<{ id: string; amount: number; status: string }>;
        try {
          const selectStart = Date.now();
          txRows = await (tx as unknown as TransactionSql)<Array<{ id: string; amount: number; status: string }>>`
            SELECT id, amount, status
            FROM transactions
            WHERE provider_transaction_id = ${input.providerTransactionId}
            LIMIT 1
          `;
          logger.info(
            { duration: Date.now() - selectStart },
            'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded select transaction',
          );
        } catch (err: unknown) {
          if (err instanceof DomainError) throw err;
          logger.error(
            { err, repository: 'MobbexBillingSyncRepository', method: 'upsertRefundAndMaybeMarkTransactionRefunded', step: 'select transaction' },
            'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded select transaction failed',
          );
          throw new ProviderError('Database error in MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded', 502, err);
        }

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
        try {
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
        } catch (err: unknown) {
          if (err instanceof DomainError) throw err;
          logger.error(
            { err, repository: 'MobbexBillingSyncRepository', method: 'upsertRefundAndMaybeMarkTransactionRefunded', step: 'upsert refund' },
            'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded upsert refund failed',
          );
          throw new ProviderError('Database error in MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded', 502, err);
        }

        // Step 4: If approved, check cumulative sum and potentially mark transaction as refunded
        if (input.refundStatus === 'approved') {
          let sumRows: Array<{ total_approved: string }>;
          try {
            const sumStart = Date.now();
            sumRows = await (tx as unknown as TransactionSql)<Array<{ total_approved: string }>>`
              SELECT COALESCE(SUM(amount), 0) AS total_approved
              FROM refunds
              WHERE transaction_id = ${transaction.id} AND status = 'approved'
            `;
            logger.info(
              { duration: Date.now() - sumStart },
              'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded sum approved',
            );
          } catch (err: unknown) {
            if (err instanceof DomainError) throw err;
            logger.error(
              { err, repository: 'MobbexBillingSyncRepository', method: 'upsertRefundAndMaybeMarkTransactionRefunded', step: 'sum approved refunds' },
              'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded sum failed',
            );
            throw new ProviderError('Database error in MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded', 502, err);
          }

          const totalApproved = parseFloat(sumRows[0].total_approved);

          // Step 5: Transition parent transaction to 'refunded' when fully covered (R004, EC003)
          if (totalApproved >= transaction.amount && transaction.status !== 'refunded') {
            try {
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
            } catch (err: unknown) {
              if (err instanceof DomainError) throw err;
              logger.error(
                { err, repository: 'MobbexBillingSyncRepository', method: 'upsertRefundAndMaybeMarkTransactionRefunded', step: 'mark transaction refunded' },
                'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded mark refunded failed',
              );
              throw new ProviderError('Database error in MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded', 502, err);
            }
            return { outcome: 'transaction_refunded' as RefundOutcome, transactionId: transaction.id };
          }

          return { outcome: 'refund_approved' as RefundOutcome, transactionId: transaction.id };
        }

        // Step 6: Failed refund — do not touch transaction status (EC004)
        return { outcome: 'refund_failed' as RefundOutcome, transactionId: transaction.id };
      });
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      // Safety net: catches errors from sql.begin itself (not sub-query bodies)
      logger.error(
        { err, repository: 'MobbexBillingSyncRepository', method: 'upsertRefundAndMaybeMarkTransactionRefunded' },
        'MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded failed',
      );
      throw new ProviderError('Database error in MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded', 502, err);
    }
  }
}
