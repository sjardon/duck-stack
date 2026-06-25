import type { Sql } from 'postgres';
import type { UserProfile } from '@repo/types';
import type { IUserRepository } from './interfaces/iUserRepository.js';
import { DomainError, NotFoundError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export class UserDBRepository implements IUserRepository {
  constructor(private readonly sql: Sql) {}

  async findByClerkUserId(clerkUserId: string): Promise<UserProfile | null> {
    const start = Date.now();
    try {
      const rows = await this.sql<
        Array<{
          name: string;
          email: string;
          avatar_url: string | null;
          locale: string | null;
          timezone: string | null;
          job_role: string | null;
          company_size: string | null;
          primary_use_case: string | null;
          onboarding_completed: boolean;
        }>
      >`SELECT name, email, avatar_url, locale, timezone,
               job_role, company_size, primary_use_case, onboarding_completed
        FROM users
        WHERE clerk_user_id = ${clerkUserId}
        LIMIT 1`;
      logger.info({ duration: Date.now() - start }, 'UserDBRepository.findByClerkUserId');

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        locale: row.locale,
        timezone: row.timezone,
        job_role: row.job_role,
        company_size: row.company_size,
        primary_use_case: row.primary_use_case,
        onboarding_completed: row.onboarding_completed,
      };
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'UserDBRepository', method: 'findByClerkUserId', clerkUserId },
        'UserDBRepository.findByClerkUserId failed',
      );
      throw new ProviderError('Database error in UserDBRepository.findByClerkUserId', 502, err);
    }
  }

  async updatePreferences(
    clerkUserId: string,
    patch: { locale?: string | null; timezone?: string | null },
  ): Promise<UserProfile> {
    const updates: Record<string, string | null> = {};
    const columns: string[] = [];

    if ('locale' in patch) {
      updates['locale'] = patch.locale ?? null;
      columns.push('locale');
    }
    if ('timezone' in patch) {
      updates['timezone'] = patch.timezone ?? null;
      columns.push('timezone');
    }

    const start = Date.now();
    try {
      const rows = await this.sql<
        Array<{
          name: string;
          email: string;
          avatar_url: string | null;
          locale: string | null;
          timezone: string | null;
          job_role: string | null;
          company_size: string | null;
          primary_use_case: string | null;
          onboarding_completed: boolean;
        }>
      >`UPDATE users
        SET ${this.sql(updates, columns)}
        WHERE clerk_user_id = ${clerkUserId}
        RETURNING name, email, avatar_url, locale, timezone,
                  job_role, company_size, primary_use_case, onboarding_completed`;
      logger.info({ duration: Date.now() - start }, 'UserDBRepository.updatePreferences');

      if (rows.length === 0) {
        throw new NotFoundError('User');
      }

      const row = rows[0];
      return {
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        locale: row.locale,
        timezone: row.timezone,
        job_role: row.job_role,
        company_size: row.company_size,
        primary_use_case: row.primary_use_case,
        onboarding_completed: row.onboarding_completed,
      };
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'UserDBRepository', method: 'updatePreferences', clerkUserId },
        'UserDBRepository.updatePreferences failed',
      );
      throw new ProviderError('Database error in UserDBRepository.updatePreferences', 502, err);
    }
  }

  async completeOnboarding(
    clerkUserId: string,
    data: { job_role: string; company_size: string; primary_use_case: string },
  ): Promise<UserProfile> {
    const start = Date.now();
    try {
      const rows = await this.sql<
        Array<{
          name: string;
          email: string;
          avatar_url: string | null;
          locale: string | null;
          timezone: string | null;
          job_role: string | null;
          company_size: string | null;
          primary_use_case: string | null;
          onboarding_completed: boolean;
        }>
      >`UPDATE users
        SET job_role = ${data.job_role},
            company_size = ${data.company_size},
            primary_use_case = ${data.primary_use_case},
            onboarding_completed = TRUE
        WHERE clerk_user_id = ${clerkUserId}
        RETURNING name, email, avatar_url, locale, timezone,
                  job_role, company_size, primary_use_case, onboarding_completed`;
      logger.info({ duration: Date.now() - start }, 'UserDBRepository.completeOnboarding');

      if (rows.length === 0) {
        throw new NotFoundError('User');
      }

      const row = rows[0];
      return {
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        locale: row.locale,
        timezone: row.timezone,
        job_role: row.job_role,
        company_size: row.company_size,
        primary_use_case: row.primary_use_case,
        onboarding_completed: row.onboarding_completed,
      };
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'UserDBRepository', method: 'completeOnboarding', clerkUserId },
        'UserDBRepository.completeOnboarding failed',
      );
      throw new ProviderError('Database error in UserDBRepository.completeOnboarding', 502, err);
    }
  }
}
