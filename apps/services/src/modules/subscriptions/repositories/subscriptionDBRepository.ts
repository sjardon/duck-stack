import type { Sql } from 'postgres';
import type { SubscriptionEntity } from '../entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../entities/subscriptionPlanEntity.js';
import type { SubscriptionWithPlanEntity } from '../entities/subscriptionWithPlanEntity.js';
import type { ISubscriptionRepository, CreateSubscriptionData } from './interfaces/iSubscriptionRepository.js';
import { DomainError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class SubscriptionDBRepository implements ISubscriptionRepository {
  constructor(private readonly sql: Sql) {}

  async findActiveByScopeStatus(userId: string, orgId: string | null): Promise<SubscriptionEntity | null> {
    const start = Date.now();
    try {
      let rows: SubscriptionEntity[];

      if (orgId !== null) {
        rows = await this.sql<SubscriptionEntity[]>`
          SELECT id, user_id, org_id, plan_id, provider, provider_subscription_id,
                 status, current_period_start, current_period_end, cancel_at_period_end,
                 canceled_at, created_at, updated_at
          FROM subscriptions
          WHERE org_id = ${orgId}
            AND status NOT IN ('canceled', 'expired')
          LIMIT 1
        `;
      } else {
        rows = await this.sql<SubscriptionEntity[]>`
          SELECT id, user_id, org_id, plan_id, provider, provider_subscription_id,
                 status, current_period_start, current_period_end, cancel_at_period_end,
                 canceled_at, created_at, updated_at
          FROM subscriptions
          WHERE user_id = ${userId}
            AND org_id IS NULL
            AND status NOT IN ('canceled', 'expired')
          LIMIT 1
        `;
      }

      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.findActiveByScopeStatus');
      return rows[0] ?? null;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'findActiveByScopeStatus' },
        'SubscriptionDBRepository.findActiveByScopeStatus failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.findActiveByScopeStatus', 502, err);
    }
  }

  async findByIdAndScope(id: string, userId: string, orgId: string | null): Promise<SubscriptionEntity | null> {
    const start = Date.now();
    try {
      let rows: SubscriptionEntity[];

      if (orgId !== null) {
        rows = await this.sql<SubscriptionEntity[]>`
          SELECT id, user_id, org_id, plan_id, provider, provider_subscription_id,
                 status, current_period_start, current_period_end, cancel_at_period_end,
                 canceled_at, created_at, updated_at
          FROM subscriptions
          WHERE id = ${id}
            AND org_id = ${orgId}
          LIMIT 1
        `;
      } else {
        rows = await this.sql<SubscriptionEntity[]>`
          SELECT id, user_id, org_id, plan_id, provider, provider_subscription_id,
                 status, current_period_start, current_period_end, cancel_at_period_end,
                 canceled_at, created_at, updated_at
          FROM subscriptions
          WHERE id = ${id}
            AND user_id = ${userId}
            AND org_id IS NULL
          LIMIT 1
        `;
      }

      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.findByIdAndScope');
      return rows[0] ?? null;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'findByIdAndScope' },
        'SubscriptionDBRepository.findByIdAndScope failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.findByIdAndScope', 502, err);
    }
  }

  async findPlanByCode(planCode: string): Promise<SubscriptionPlanEntity | null> {
    const start = Date.now();
    try {
      const rows = await this.sql<SubscriptionPlanEntity[]>`
        SELECT id, code, name, description, price, currency, interval, features,
               is_active, provider_plan_id, created_at, updated_at
        FROM subscription_plans
        WHERE code = ${planCode}
          AND is_active = true
        LIMIT 1
      `;
      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.findPlanByCode');
      return rows[0] ?? null;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'findPlanByCode' },
        'SubscriptionDBRepository.findPlanByCode failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.findPlanByCode', 502, err);
    }
  }

  async create(input: CreateSubscriptionData): Promise<SubscriptionEntity> {
    const start = Date.now();
    try {
      const rows = await this.sql<SubscriptionEntity[]>`
        INSERT INTO subscriptions (
          id, user_id, org_id, plan_id, provider, provider_subscription_id,
          status, current_period_start, current_period_end
        ) VALUES (
          ${input.id},
          ${input.user_id},
          ${input.org_id},
          ${input.plan_id},
          ${input.provider},
          ${input.provider_subscription_id},
          ${input.status},
          ${input.current_period_start},
          ${input.current_period_end}
        )
        RETURNING id, user_id, org_id, plan_id, provider, provider_subscription_id,
                  status, current_period_start, current_period_end, cancel_at_period_end,
                  canceled_at, created_at, updated_at
      `;
      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.create');
      return rows[0];
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'create' },
        'SubscriptionDBRepository.create failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.create', 502, err);
    }
  }

  async setCancelAtPeriodEnd(id: string): Promise<SubscriptionEntity> {
    const start = Date.now();
    try {
      const rows = await this.sql<SubscriptionEntity[]>`
        UPDATE subscriptions
        SET cancel_at_period_end = true,
            updated_at = now()
        WHERE id = ${id}
        RETURNING id, user_id, org_id, plan_id, provider, provider_subscription_id,
                  status, current_period_start, current_period_end, cancel_at_period_end,
                  canceled_at, created_at, updated_at
      `;
      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.setCancelAtPeriodEnd');
      return rows[0];
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'setCancelAtPeriodEnd' },
        'SubscriptionDBRepository.setCancelAtPeriodEnd failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.setCancelAtPeriodEnd', 502, err);
    }
  }

  async findActiveOrWithinPeriodByScope(userId: string, orgId: string | null): Promise<SubscriptionWithPlanEntity | null> {
    const start = Date.now();
    try {
      let rows: SubscriptionWithPlanEntity[];

      if (orgId !== null) {
        rows = await this.sql<SubscriptionWithPlanEntity[]>`
          SELECT s.id, s.user_id, s.org_id, s.plan_id, s.provider,
                 s.provider_subscription_id, s.status,
                 s.current_period_start, s.current_period_end,
                 s.cancel_at_period_end, s.canceled_at, s.created_at, s.updated_at,
                 sp.code AS plan_code
          FROM subscriptions s
          JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE s.org_id = ${orgId}
            AND (
              s.status NOT IN ('canceled', 'expired')
              OR (s.status = 'canceled' AND s.current_period_end > NOW())
            )
          ORDER BY
            CASE WHEN s.status NOT IN ('canceled', 'expired') THEN 0 ELSE 1 END ASC,
            s.created_at DESC
          LIMIT 1
        `;
      } else {
        rows = await this.sql<SubscriptionWithPlanEntity[]>`
          SELECT s.id, s.user_id, s.org_id, s.plan_id, s.provider,
                 s.provider_subscription_id, s.status,
                 s.current_period_start, s.current_period_end,
                 s.cancel_at_period_end, s.canceled_at, s.created_at, s.updated_at,
                 sp.code AS plan_code
          FROM subscriptions s
          JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE s.user_id = ${userId}
            AND s.org_id IS NULL
            AND (
              s.status NOT IN ('canceled', 'expired')
              OR (s.status = 'canceled' AND s.current_period_end > NOW())
            )
          ORDER BY
            CASE WHEN s.status NOT IN ('canceled', 'expired') THEN 0 ELSE 1 END ASC,
            s.created_at DESC
          LIMIT 1
        `;
      }

      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.findActiveOrWithinPeriodByScope');
      return rows[0] ?? null;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'findActiveOrWithinPeriodByScope' },
        'SubscriptionDBRepository.findActiveOrWithinPeriodByScope failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.findActiveOrWithinPeriodByScope', 502, err);
    }
  }

  async cancelImmediately(id: string): Promise<SubscriptionEntity> {
    const start = Date.now();
    try {
      const rows = await this.sql<SubscriptionEntity[]>`
        UPDATE subscriptions
        SET status = 'canceled',
            canceled_at = now(),
            updated_at = now()
        WHERE id = ${id}
        RETURNING id, user_id, org_id, plan_id, provider, provider_subscription_id,
                  status, current_period_start, current_period_end, cancel_at_period_end,
                  canceled_at, created_at, updated_at
      `;
      logger.info({ duration: Date.now() - start }, 'SubscriptionDBRepository.cancelImmediately');
      return rows[0];
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'SubscriptionDBRepository', method: 'cancelImmediately' },
        'SubscriptionDBRepository.cancelImmediately failed',
      );
      throw new ProviderError('Database error in SubscriptionDBRepository.cancelImmediately', 502, err);
    }
  }
}
