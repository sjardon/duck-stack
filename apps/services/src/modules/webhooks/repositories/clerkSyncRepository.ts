import type { Sql } from 'postgres';
import { DomainError, ProviderError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export interface UpsertUserData {
  clerkUserId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface UpsertOrganizationData {
  clerkOrgId: string;
  name: string;
  slug: string;
}

export interface CreateMembershipData {
  clerkUserId: string;
  clerkOrgId: string;
  role: string;
}

export class ClerkSyncRepository {
  constructor(private readonly sql: Sql) {}

  async upsertUser(data: UpsertUserData): Promise<{ id: string }> {
    const start = Date.now();
    try {
      const rows = await this.sql<Array<{ id: string }>>`
        INSERT INTO users (clerk_user_id, email, name, avatar_url)
        VALUES (${data.clerkUserId}, ${data.email}, ${data.name}, ${data.avatarUrl})
        ON CONFLICT (clerk_user_id) DO UPDATE
          SET email = EXCLUDED.email,
              name = EXCLUDED.name,
              avatar_url = EXCLUDED.avatar_url
        RETURNING id`;
      logger.info({ duration: Date.now() - start }, 'ClerkSyncRepository.upsertUser');
      return rows[0];
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'ClerkSyncRepository', method: 'upsertUser' },
        'ClerkSyncRepository.upsertUser failed',
      );
      throw new ProviderError('Database error in ClerkSyncRepository.upsertUser', 502, err);
    }
  }

  async upsertOrganization(data: UpsertOrganizationData): Promise<{ id: string }> {
    const start = Date.now();
    try {
      const rows = await this.sql<Array<{ id: string }>>`
        INSERT INTO organizations (clerk_org_id, name, slug)
        VALUES (${data.clerkOrgId}, ${data.name}, ${data.slug})
        ON CONFLICT (clerk_org_id) DO UPDATE
          SET name = EXCLUDED.name,
              slug = EXCLUDED.slug
        RETURNING id`;
      logger.info({ duration: Date.now() - start }, 'ClerkSyncRepository.upsertOrganization');
      return rows[0];
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'ClerkSyncRepository', method: 'upsertOrganization' },
        'ClerkSyncRepository.upsertOrganization failed',
      );
      throw new ProviderError('Database error in ClerkSyncRepository.upsertOrganization', 502, err);
    }
  }

  async createMembership(data: CreateMembershipData): Promise<void> {
    try {
      // Resolve local user UUID from clerk_user_id
      const userStart = Date.now();
      const userRows = await this.sql<Array<{ id: string }>>`
        SELECT id FROM users WHERE clerk_user_id = ${data.clerkUserId} LIMIT 1`;
      logger.info({ duration: Date.now() - userStart }, 'ClerkSyncRepository.createMembership select user');

      if (userRows.length === 0) {
        logger.warn({ clerkUserId: data.clerkUserId }, 'createMembership: user not found; skipping membership insert (EC005)');
        return;
      }

      // Resolve local org UUID from clerk_org_id
      const orgStart = Date.now();
      const orgRows = await this.sql<Array<{ id: string }>>`
        SELECT id FROM organizations WHERE clerk_org_id = ${data.clerkOrgId} LIMIT 1`;
      logger.info({ duration: Date.now() - orgStart }, 'ClerkSyncRepository.createMembership select organization');

      if (orgRows.length === 0) {
        logger.warn({ clerkOrgId: data.clerkOrgId }, 'createMembership: organization not found; skipping membership insert (EC005)');
        return;
      }

      const insertStart = Date.now();
      await this.sql`
        INSERT INTO organization_members (user_id, org_id, role)
        VALUES (${userRows[0].id}, ${orgRows[0].id}, ${data.role})
        ON CONFLICT (user_id, org_id) DO NOTHING`;
      logger.info({ duration: Date.now() - insertStart }, 'ClerkSyncRepository.createMembership insert membership');
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'ClerkSyncRepository', method: 'createMembership' },
        'ClerkSyncRepository.createMembership failed',
      );
      throw new ProviderError('Database error in ClerkSyncRepository.createMembership', 502, err);
    }
  }
}
