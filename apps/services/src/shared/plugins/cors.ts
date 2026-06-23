import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { serverConfig } from '../configs/serverConfig.js';

export default fp(async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: serverConfig.corsOrigin,
  });
});
