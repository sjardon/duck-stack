import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { DomainError } from '../errors.js';
import { logger } from '../infrastructure/logger.js';

function logError(error: unknown): void {
  if (error instanceof DomainError) {
    if (error.statusCode < 500) {
      logger.warn(
        {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        },
        'Domain error (client)',
      );
    } else {
      logger.error(
        {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          stack: error.stack,
          originalError: error.originalError,
        },
        'Domain error (server)',
      );
    }
  } else {
    logger.error(
      {
        message: (error as Error).message ?? String(error),
        stack: (error as Error).stack,
        originalError: error,
      },
      'Unhandled error',
    );
  }
}

export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, request, reply) => {
    logError(error);

    if (error instanceof DomainError) {
      return reply
        .status(error.statusCode)
        .send({ code: error.code, message: error.message });
    }

    return reply
      .status(500)
      .send({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
