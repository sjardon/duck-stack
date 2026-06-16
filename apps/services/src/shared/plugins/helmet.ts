import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

export default fp(async function helmetPlugin(fastify: FastifyInstance) {
  await fastify.register(helmet);
});
