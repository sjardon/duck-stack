import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { verifyToken } from '@clerk/backend';
import { authConfig } from '../configs/authConfig.js';

export default fp(async function clerkAuthPlugin(fastify: FastifyInstance) {
  const jwtKey = authConfig.clerkJwtKey;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      'CLERK_SECRET_KEY environment variable is missing. ' +
        'Set it before starting the services application.',
    );
  }

  fastify.addHook('onRequest', async (request) => {
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      return;
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      // jwtKey (PEM public key) enables fully networkless verification (NF001).
      // Falls back to JWKS fetch via secretKey only if jwtKey is not configured.
      const payload = await verifyToken(token, jwtKey ? { jwtKey } : { secretKey });
      request.userId = payload.sub;
      request.orgId = (payload as Record<string, unknown>)['org_id'] as string | null ?? null;
    } catch {
      // Expired or invalid JWT — leave userId/orgId unset (EC003).
    }
  });
});
