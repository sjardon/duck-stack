import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/plugins/require-auth.js';
import { getUserProfileHandler } from './handlers/getUserProfileHandler.js';
import { updateUserProfileHandler } from './handlers/updateUserProfileHandler.js';

export default fp(async function usersRoutes(fastify: FastifyInstance) {
  fastify.get('/users/me', { preHandler: requireAuth }, getUserProfileHandler);
  fastify.patch('/users/me', { preHandler: requireAuth }, updateUserProfileHandler);
});
