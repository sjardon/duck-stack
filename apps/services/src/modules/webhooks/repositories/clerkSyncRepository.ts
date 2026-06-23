import type { Sql } from 'postgres';
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

  async upsertUser(data: UpsertUserData): Promise<void> {
    const start = Date.now();
    await this.sql`
      INSERT INTO users (clerk_user_id, email, name, avatar_url)
      VALUES (${data.clerkUserId}, ${data.email}, ${data.name}, ${data.avatarUrl})
      ON CONFLICT (clerk_user_id) DO UPDATE
        SET email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url`;
    logger.info({ duration: Date.now() - start }, 'ClerkSyncRepository.upsertUser');
  }

  async upsertOrganization(data: UpsertOrganizationData): Promise<void> {
    const start = Date.now();
    await this.sql`
      INSERT INTO organizations (clerk_org_id, name, slug)
      VALUES (${data.clerkOrgId}, ${data.name}, ${data.slug})
      ON CONFLICT (clerk_org_id) DO UPDATE
        SET name = EXCLUDED.name,
            slug = EXCLUDED.slug`;
    logger.info({ duration: Date.now() - start }, 'ClerkSyncRepository.upsertOrganization');
  }

  async createMembership(data: CreateMembershipData): Promise<void> {
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
  }
}
