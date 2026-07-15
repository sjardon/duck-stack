import type { Sql } from 'postgres';
import type { IIdentityRepository } from './interfaces/iIdentityRepository.js';
import { DomainError, ProviderError } from '../errors.js';
import { logger } from '../infrastructure/logger.js';

export class IdentityDBRepository implements IIdentityRepository {
  constructor(private readonly sql: Sql) {}

  async findUserIdByClerkUserId(clerkUserId: string): Promise<string | null> {
    const start = Date.now();
    try {
      const rows = await this.sql<Array<{ id: string }>>`
        SELECT id FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`;
      logger.info({ duration: Date.now() - start }, 'IdentityDBRepository.findUserIdByClerkUserId');

      return rows.length === 0 ? null : rows[0].id;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'IdentityDBRepository', method: 'findUserIdByClerkUserId', clerkUserId },
        'IdentityDBRepository.findUserIdByClerkUserId failed',
      );
      throw new ProviderError('Database error in IdentityDBRepository.findUserIdByClerkUserId', 502, err);
    }
  }

  async findOrgIdByClerkOrgId(clerkOrgId: string): Promise<string | null> {
    const start = Date.now();
    try {
      const rows = await this.sql<Array<{ id: string }>>`
        SELECT id FROM organizations WHERE clerk_org_id = ${clerkOrgId} LIMIT 1`;
      logger.info({ duration: Date.now() - start }, 'IdentityDBRepository.findOrgIdByClerkOrgId');

      return rows.length === 0 ? null : rows[0].id;
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      logger.error(
        { err, repository: 'IdentityDBRepository', method: 'findOrgIdByClerkOrgId', clerkOrgId },
        'IdentityDBRepository.findOrgIdByClerkOrgId failed',
      );
      throw new ProviderError('Database error in IdentityDBRepository.findOrgIdByClerkOrgId', 502, err);
    }
  }
}
