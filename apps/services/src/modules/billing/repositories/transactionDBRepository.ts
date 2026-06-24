import type { Sql } from 'postgres';
import type { BaseLogger } from 'pino';
import type { TransactionEntity } from '../entities/transactionEntity.js';
import type { RefundEntity } from '../entities/refundEntity.js';
import type {
  ITransactionRepository,
  CreateTransactionData,
  ListTransactionsQuery,
} from './interfaces/iTransactionRepository.js';

export class TransactionDBRepository implements ITransactionRepository {
  constructor(private readonly sql: Sql) {}

  async create(input: CreateTransactionData, logger: BaseLogger): Promise<TransactionEntity> {
    const start = Date.now();
    const rows = await this.sql<TransactionEntity[]>`
      INSERT INTO transactions (
        id, user_id, org_id, provider, amount, currency,
        description, reference, idempotency_key, metadata, status
      ) VALUES (
        ${input.id},
        ${input.user_id},
        ${input.org_id},
        ${input.provider},
        ${input.amount},
        ${input.currency},
        ${input.description},
        ${input.reference},
        ${input.idempotency_key ?? null},
        ${input.metadata ? this.sql.json(input.metadata as Record<string, never>) : null},
        'pending'
      )
      RETURNING id, user_id, org_id, provider, provider_transaction_id, amount, currency,
                status, description, reference, idempotency_key, metadata, failure_reason,
                checkout_url, created_at, updated_at
    `;
    logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.create');

    return rows[0];
  }

  async findById(id: string, logger: BaseLogger): Promise<TransactionEntity | null> {
    const start = Date.now();
    const rows = await this.sql<TransactionEntity[]>`
      SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
             status, description, reference, idempotency_key, metadata, failure_reason,
             checkout_url, created_at, updated_at
      FROM transactions
      WHERE id = ${id}
      LIMIT 1
    `;
    logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.findById');

    return rows[0] ?? null;
  }

  async findByIdempotencyKey(
    key: string,
    userId: string,
    orgId: string | null,
    logger: BaseLogger,
  ): Promise<TransactionEntity | null> {
    let rows: TransactionEntity[];

    if (orgId !== null) {
      const start = Date.now();
      rows = await this.sql<TransactionEntity[]>`
        SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
               status, description, reference, idempotency_key, metadata, failure_reason,
               checkout_url, created_at, updated_at
        FROM transactions
        WHERE idempotency_key = ${key}
          AND org_id = ${orgId}
        LIMIT 1
      `;
      logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.findByIdempotencyKey');
    } else {
      const start = Date.now();
      rows = await this.sql<TransactionEntity[]>`
        SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
               status, description, reference, idempotency_key, metadata, failure_reason,
               checkout_url, created_at, updated_at
        FROM transactions
        WHERE idempotency_key = ${key}
          AND user_id = ${userId}
          AND org_id IS NULL
        LIMIT 1
      `;
      logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.findByIdempotencyKey');
    }

    return rows[0] ?? null;
  }

  async updateFailureReason(id: string, reason: string, logger: BaseLogger): Promise<void> {
    const start = Date.now();
    await this.sql`
      UPDATE transactions
      SET failure_reason = ${reason}
      WHERE id = ${id}
    `;
    logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.updateFailureReason');
  }

  async updateProviderData(
    id: string,
    data: { providerTransactionId: string; checkoutUrl: string },
    logger: BaseLogger,
  ): Promise<void> {
    const start = Date.now();
    await this.sql`
      UPDATE transactions
      SET provider_transaction_id = ${data.providerTransactionId},
          checkout_url = ${data.checkoutUrl}
      WHERE id = ${id}
    `;
    logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.updateProviderData');
  }

  async list(
    query: ListTransactionsQuery,
    logger: BaseLogger,
  ): Promise<{ rows: TransactionEntity[]; nextCursor: string | null }> {
    const { userId, orgId, limit, cursor } = query;
    const fetchLimit = limit + 1;

    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as { created_at: string; id: string };
      cursorCreatedAt = parsed.created_at;
      cursorId = parsed.id;
    }

    let allRows: TransactionEntity[];

    if (orgId !== null) {
      if (cursorCreatedAt && cursorId) {
        const start = Date.now();
        allRows = await this.sql<TransactionEntity[]>`
          SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
                 status, description, reference, idempotency_key, metadata, failure_reason,
                 checkout_url, created_at, updated_at
          FROM transactions
          WHERE org_id = ${orgId}
            AND (created_at, id) < (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
        logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.list');
      } else {
        const start = Date.now();
        allRows = await this.sql<TransactionEntity[]>`
          SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
                 status, description, reference, idempotency_key, metadata, failure_reason,
                 checkout_url, created_at, updated_at
          FROM transactions
          WHERE org_id = ${orgId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
        logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.list');
      }
    } else {
      if (cursorCreatedAt && cursorId) {
        const start = Date.now();
        allRows = await this.sql<TransactionEntity[]>`
          SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
                 status, description, reference, idempotency_key, metadata, failure_reason,
                 checkout_url, created_at, updated_at
          FROM transactions
          WHERE user_id = ${userId}
            AND org_id IS NULL
            AND (created_at, id) < (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
        logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.list');
      } else {
        const start = Date.now();
        allRows = await this.sql<TransactionEntity[]>`
          SELECT id, user_id, org_id, provider, provider_transaction_id, amount, currency,
                 status, description, reference, idempotency_key, metadata, failure_reason,
                 checkout_url, created_at, updated_at
          FROM transactions
          WHERE user_id = ${userId}
            AND org_id IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
        logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.list');
      }
    }

    let nextCursor: string | null = null;

    if (allRows.length > limit) {
      const lastRow = allRows[limit];
      const cursorPayload = JSON.stringify({
        created_at: lastRow.created_at,
        id: lastRow.id,
      });
      nextCursor = Buffer.from(cursorPayload).toString('base64');
      allRows = allRows.slice(0, limit);
    }

    return { rows: allRows, nextCursor };
  }

  async getRefundsByTransactionId(transactionId: string, logger: BaseLogger): Promise<RefundEntity[]> {
    const start = Date.now();
    const rows = await this.sql<RefundEntity[]>`
      SELECT id, transaction_id, amount, reason, status, provider_refund_id, created_at, updated_at
      FROM refunds
      WHERE transaction_id = ${transactionId}
      ORDER BY created_at ASC
    `;
    logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.getRefundsByTransactionId');

    return rows;
  }
}
