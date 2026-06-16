import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export default fp(async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });
});
