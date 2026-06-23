import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/plugins/requireAuth.js';
import { getUserProfileHandler } from './handlers/getUserProfileHandler.js';
import { updateUserProfileHandler } from './handlers/updateUserProfileHandler.js';
import { completeOnboardingHandler } from './handlers/completeOnboardingHandler.js';

export default fp(async function usersRoutes(fastify: FastifyInstance) {
  fastify.get('/users/me', { preHandler: requireAuth }, getUserProfileHandler);
  fastify.patch('/users/me', { preHandler: requireAuth }, updateUserProfileHandler);
  fastify.post('/users/me/onboarding', { preHandler: requireAuth }, completeOnboardingHandler);
});
