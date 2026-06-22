import type { Sql } from 'postgres';
import type { UserProfile } from '@repo/types';
import type { IUserRepository } from './interfaces/IUserRepository.js';

export class UserDBRepository implements IUserRepository {
  constructor(private readonly sql: Sql) {}

  async findByClerkUserId(clerkUserId: string): Promise<UserProfile | null> {
    const rows = await this.sql<
      Array<{ name: string; email: string; avatar_url: string | null; locale: string | null; timezone: string | null }>
    >`SELECT name, email, avatar_url, locale, timezone
      FROM users
      WHERE clerk_user_id = ${clerkUserId}
      LIMIT 1`;

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
    };
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

    const rows = await this.sql<
      Array<{ name: string; email: string; avatar_url: string | null; locale: string | null; timezone: string | null }>
    >`UPDATE users
      SET ${this.sql(updates, columns)}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING name, email, avatar_url, locale, timezone`;

    const row = rows[0];
    return {
      name: row.name,
      email: row.email,
      avatar_url: row.avatar_url,
      locale: row.locale,
      timezone: row.timezone,
    };
  }
}
