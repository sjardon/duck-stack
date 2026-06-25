import type { Sql } from 'postgres';
import type { TransactionEntity } from '../entities/transactionEntity.js';
import type { RefundEntity } from '../entities/refundEntity.js';
import type {
  ITransactionRepository,
  CreateTransactionData,
  ListTransactionsQuery,
} from './interfaces/iTransactionRepository.js';
import { DomainError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class TransactionDBRepository implements ITransactionRepository {
  constructor(private readonly sql: Sql) {}

  async create(input: CreateTransactionData): Promise<TransactionEntity> {
    const start = Date.now();
    try {
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
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'create' },
        'TransactionDBRepository.create failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.create', 502, err);
    }
  }

  async findById(id: string): Promise<TransactionEntity | null> {
    const start = Date.now();
    try {
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
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'findById' },
        'TransactionDBRepository.findById failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.findById', 502, err);
    }
  }

  async findByIdempotencyKey(
    key: string,
    userId: string,
    orgId: string | null,
  ): Promise<TransactionEntity | null> {
    try {
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
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'findByIdempotencyKey' },
        'TransactionDBRepository.findByIdempotencyKey failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.findByIdempotencyKey', 502, err);
    }
  }

  async updateFailureReason(id: string, reason: string): Promise<void> {
    const start = Date.now();
    try {
      await this.sql`
        UPDATE transactions
        SET failure_reason = ${reason}
        WHERE id = ${id}
      `;
      logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.updateFailureReason');
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'updateFailureReason' },
        'TransactionDBRepository.updateFailureReason failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.updateFailureReason', 502, err);
    }
  }

  async updateProviderData(
    id: string,
    data: { providerTransactionId: string; checkoutUrl: string },
  ): Promise<void> {
    const start = Date.now();
    try {
      await this.sql`
        UPDATE transactions
        SET provider_transaction_id = ${data.providerTransactionId},
            checkout_url = ${data.checkoutUrl}
        WHERE id = ${id}
      `;
      logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.updateProviderData');
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'updateProviderData' },
        'TransactionDBRepository.updateProviderData failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.updateProviderData', 502, err);
    }
  }

  async list(
    query: ListTransactionsQuery,
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

    try {
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
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'list' },
        'TransactionDBRepository.list failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.list', 502, err);
    }
  }

  async getRefundsByTransactionId(transactionId: string): Promise<RefundEntity[]> {
    const start = Date.now();
    try {
      const rows = await this.sql<RefundEntity[]>`
        SELECT id, transaction_id, amount, reason, status, provider_refund_id, created_at, updated_at
        FROM refunds
        WHERE transaction_id = ${transactionId}
        ORDER BY created_at ASC
      `;
      logger.info({ duration: Date.now() - start }, 'TransactionDBRepository.getRefundsByTransactionId');

      return rows;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'TransactionDBRepository', method: 'getRefundsByTransactionId' },
        'TransactionDBRepository.getRefundsByTransactionId failed',
      );
      throw new ProviderError('Database error in TransactionDBRepository.getRefundsByTransactionId', 502, err);
    }
  }
}
