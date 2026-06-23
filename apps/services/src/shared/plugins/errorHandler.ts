import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { DomainError } from '../errors.js';

export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply
        .status(error.statusCode)
        .send({ code: error.code, message: error.message });
    }
    return reply.send(error);
  });
});
