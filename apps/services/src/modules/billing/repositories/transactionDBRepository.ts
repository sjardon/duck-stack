import type { Sql } from 'postgres';
import type { TransactionEntity } from '../entities/transaction.entity.js';
import type {
  ITransactionRepository,
  CreateTransactionData,
  ListTransactionsQuery,
} from './interfaces/iTransactionRepository.js';

export class TransactionDBRepository implements ITransactionRepository {
  constructor(private readonly sql: Sql) {}

  async create(input: CreateTransactionData): Promise<TransactionEntity> {
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
      RETURNING *
    `;

    return rows[0];
  }

  async findById(id: string): Promise<TransactionEntity | null> {
    const rows = await this.sql<TransactionEntity[]>`
      SELECT * FROM transactions
      WHERE id = ${id}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async findByIdempotencyKey(
    key: string,
    userId: string,
    orgId: string | null,
  ): Promise<TransactionEntity | null> {
    let rows: TransactionEntity[];

    if (orgId !== null) {
      rows = await this.sql<TransactionEntity[]>`
        SELECT * FROM transactions
        WHERE idempotency_key = ${key}
          AND org_id = ${orgId}
        LIMIT 1
      `;
    } else {
      rows = await this.sql<TransactionEntity[]>`
        SELECT * FROM transactions
        WHERE idempotency_key = ${key}
          AND user_id = ${userId}
          AND org_id IS NULL
        LIMIT 1
      `;
    }

    return rows[0] ?? null;
  }

  async updateFailureReason(id: string, reason: string): Promise<void> {
    await this.sql`
      UPDATE transactions
      SET failure_reason = ${reason}
      WHERE id = ${id}
    `;
  }

  async updateProviderData(
    id: string,
    data: { providerTransactionId: string; checkoutUrl: string },
  ): Promise<void> {
    await this.sql`
      UPDATE transactions
      SET provider_transaction_id = ${data.providerTransactionId},
          checkout_url = ${data.checkoutUrl}
      WHERE id = ${id}
    `;
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

    let allRows: TransactionEntity[];

    if (orgId !== null) {
      if (cursorCreatedAt && cursorId) {
        allRows = await this.sql<TransactionEntity[]>`
          SELECT * FROM transactions
          WHERE org_id = ${orgId}
            AND (created_at, id) < (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      } else {
        allRows = await this.sql<TransactionEntity[]>`
          SELECT * FROM transactions
          WHERE org_id = ${orgId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }
    } else {
      if (cursorCreatedAt && cursorId) {
        allRows = await this.sql<TransactionEntity[]>`
          SELECT * FROM transactions
          WHERE user_id = ${userId}
            AND org_id IS NULL
            AND (created_at, id) < (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      } else {
        allRows = await this.sql<TransactionEntity[]>`
          SELECT * FROM transactions
          WHERE user_id = ${userId}
            AND org_id IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
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
}
