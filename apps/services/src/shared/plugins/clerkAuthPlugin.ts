import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { verifyToken } from '@clerk/backend';
import { authConfig } from '../configs/authConfig.js';
import { logger } from '../infrastructure/logger.js';
import { db } from '../infrastructure/db.js';
import { clerkClient } from '../infrastructure/clerkClient.js';
import { IdentityDBRepository } from '../repositories/identityDBRepository.js';
import { ClerkMetadataProvider } from '../providers/clerkMetadataProvider.js';
import { resolveIdentityClaim } from './resolveIdentityClaim.js';
import { ServiceUnavailableError } from '../errors.js';

export default fp(async function clerkAuthPlugin(fastify: FastifyInstance) {
  const jwtKey = authConfig.clerkJwtKey;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      'CLERK_SECRET_KEY environment variable is missing. ' +
        'Set it before starting the services application.',
    );
  }

  const identityRepo = new IdentityDBRepository(db);
  const metadataProvider = new ClerkMetadataProvider(clerkClient);

  fastify.addHook('onRequest', async (request) => {
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      return;
    }

    const token = authHeader.slice('Bearer '.length);

    let payload;
    try {
      // jwtKey (PEM public key) enables fully networkless verification (NF001).
      // Falls back to JWKS fetch via secretKey only if jwtKey is not configured.
      payload = await verifyToken(token, jwtKey ? { jwtKey } : { secretKey });
    } catch (err) {
      // Non-critical silent fail: an invalid or expired JWT leaves userId/orgId unset.
      // Downstream requireAuth / requireOrg preHandlers decide whether the route requires auth.
      // R011, R013: log at warn so traces are complete; do not re-throw (EC004).
      logger.warn({ err }, 'clerkAuthPlugin: JWT verification failed; request proceeds without userId');
      return;
    }

    // A thrown ServiceUnavailableError from this point on propagates to the
    // global errorHandler (outside the verifyToken try/catch above) — R007.
    request.clerkUserId = payload.sub; // R004
    request.clerkOrgId = (payload as Record<string, unknown>)['org_id'] as string | null ?? null; // R004

    const appUserId = (payload as Record<string, unknown>)['app_user_id'] as string | undefined;
    const userId = await resolveIdentityClaim({
      claimValue: appUserId,
      clerkId: request.clerkUserId,
      lookupById: (id) => identityRepo.findUserIdByClerkUserId(id),
      backfill: (id, internalId) => metadataProvider.setUserAppId(id, internalId),
    });
    if (userId === null) {
      throw new ServiceUnavailableError(); // R007
    }
    request.userId = userId; // R001

    if (request.clerkOrgId === null) {
      request.orgId = null; // R003
      return;
    }

    const appOrgId = (payload as Record<string, unknown>)['app_org_id'] as string | undefined;
    const orgId = await resolveIdentityClaim({
      claimValue: appOrgId,
      clerkId: request.clerkOrgId,
      lookupById: (id) => identityRepo.findOrgIdByClerkOrgId(id),
      backfill: (id, internalId) => metadataProvider.setOrgAppId(id, internalId),
    });
    if (orgId === null) {
      throw new ServiceUnavailableError(); // R007
    }
    request.orgId = orgId; // R002
  });
});
