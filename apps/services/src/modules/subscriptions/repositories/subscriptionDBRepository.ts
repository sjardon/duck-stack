import type { Sql } from 'postgres';
import type { SubscriptionEntity } from '../entities/subscriptionEntity.js';
import type { SubscriptionPlanEntity } from '../entities/subscriptionPlanEntity.js';
import type { ISubscriptionRepository, CreateSubscriptionData } from './interfaces/iSubscriptionRepository.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class SubscriptionDBRepository implements ISubscriptionRepository {
  constructor(private readonly sql: Sql) {}

  async findActiveByScopeStatus(userId: string, orgId: string | null): Promise<SubscriptionEntity | null> {
    const start = Date.now();
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
  }

  async findByIdAndScope(id: string, userId: string, orgId: string | null): Promise<SubscriptionEntity | null> {
    const start = Date.now();
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
  }

  async findPlanByCode(planCode: string): Promise<SubscriptionPlanEntity | null> {
    const start = Date.now();
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
  }

  async create(input: CreateSubscriptionData): Promise<SubscriptionEntity> {
    const start = Date.now();
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
  }

  async setCancelAtPeriodEnd(id: string): Promise<SubscriptionEntity> {
    const start = Date.now();
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
  }

  async cancelImmediately(id: string): Promise<SubscriptionEntity> {
    const start = Date.now();
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
  }
}
