import type { Sql } from 'postgres';
import type { IUsageCounterRepository } from './interfaces/iUsageCounterRepository.js';
import { DomainError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class UsageCounterDBRepository implements IUsageCounterRepository {
  constructor(private readonly sql: Sql) {}

  async incrementAndReturn(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
  ): Promise<number> {
    const start = Date.now();
    try {
      const rows = await this.sql<{ count: number }[]>`
        INSERT INTO usage_counters (user_id, org_id, quota_name, period_start, count)
        VALUES (${userId}, ${orgId}, ${quotaName}, ${periodStart}, 1)
        ON CONFLICT (user_id, org_id, quota_name, period_start)
        DO UPDATE SET count = usage_counters.count + 1, updated_at = now()
        RETURNING count
      `;
      logger.info({ duration: Date.now() - start }, 'UsageCounterDBRepository.incrementAndReturn');
      return rows[0]!.count;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'UsageCounterDBRepository', method: 'incrementAndReturn' },
        'UsageCounterDBRepository.incrementAndReturn failed',
      );
      throw new ProviderError('Database error in UsageCounterDBRepository.incrementAndReturn', 502, err);
    }
  }

  async findCount(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
  ): Promise<number> {
    const start = Date.now();
    try {
      const rows = await this.sql<{ count: number }[]>`
        SELECT count
        FROM usage_counters
        WHERE user_id IS NOT DISTINCT FROM ${userId}
          AND org_id IS NOT DISTINCT FROM ${orgId}
          AND quota_name = ${quotaName}
          AND period_start = ${periodStart}
        LIMIT 1
      `;
      logger.info({ duration: Date.now() - start }, 'UsageCounterDBRepository.findCount');
      return rows[0]?.count ?? 0;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'UsageCounterDBRepository', method: 'findCount' },
        'UsageCounterDBRepository.findCount failed',
      );
      throw new ProviderError('Database error in UsageCounterDBRepository.findCount', 502, err);
    }
  }
}
