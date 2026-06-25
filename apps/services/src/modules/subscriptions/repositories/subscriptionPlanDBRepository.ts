import type { Sql } from 'postgres';
import type { SubscriptionPlanEntity } from '../entities/subscriptionPlanEntity.js';
import type { ISubscriptionPlanRepository } from './interfaces/iSubscriptionPlanRepository.js';
import { DomainError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class SubscriptionPlanDBRepository implements ISubscriptionPlanRepository {
  constructor(private readonly sql: Sql) {}

  async listActive(): Promise<SubscriptionPlanEntity[]> {
    const start = Date.now();
    try {
      const rows = await this.sql<SubscriptionPlanEntity[]>`
        SELECT id, code, name, description, price, currency, interval, features,
               is_active, provider_plan_id, created_at, updated_at
        FROM subscription_plans
        WHERE is_active = true
        ORDER BY price ASC
      `;
      logger.info({ duration: Date.now() - start }, 'SubscriptionPlanDBRepository.listActive');

      return rows;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionPlanDBRepository', method: 'listActive' },
        'SubscriptionPlanDBRepository.listActive failed',
      );
      throw new ProviderError('Database error in SubscriptionPlanDBRepository.listActive', 502, err);
    }
  }
}
