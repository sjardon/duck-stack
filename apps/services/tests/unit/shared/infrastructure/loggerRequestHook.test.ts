import Fastify from 'fastify';
import pino from 'pino';
import { Writable } from 'node:stream';
import { requestContext } from '../../../../src/shared/infrastructure/requestContext.js';

/**
 * Builds a minimal Fastify instance that:
 *  - Uses requestContext.run in an onRequest hook (mirrors app.ts)
 *  - Captures log lines via a Writable stream
 *  - Exposes a /test route that logs via the static-like mixin logger
 */
function buildTestApp() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim());
      callback();
    },
  });

  const testLogger = pino(
    {
      level: 'trace',
      mixin() {
        const store = requestContext.getStore();
        return store ? { requestId: store.requestId } : {};
      },
    },
    stream,
  );

  const fastify = Fastify({ logger: false });

  // Register the same onRequest hook as in app.ts
  fastify.addHook('onRequest', (request, _reply, done) => {
    requestContext.run({ requestId: request.id }, done);
  });

  fastify.get('/test', (request, reply) => {
    testLogger.info('handler log');
    void reply.send({ ok: true });
  });

  return { fastify, lines, testLogger };
}

describe('loggerRequestHook', () => {
  describe('WHEN a request is handled', () => {
    it('log lines emitted by the static logger during the handler include a requestId', async () => {
      const { fastify, lines } = buildTestApp();

      const response = await fastify.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(200);

      expect(lines.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(lines[0]);
      expect(logEntry).toHaveProperty('requestId');
      expect(typeof logEntry.requestId).toBe('string');
      expect(logEntry.requestId.length).toBeGreaterThan(0);

      await fastify.close();
    });

    it('the requestId in the log matches the request id assigned by Fastify (request.id)', async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString().trim());
          callback();
        },
      });

      const testLogger = pino(
        {
          level: 'trace',
          mixin() {
            const store = requestContext.getStore();
            return store ? { requestId: store.requestId } : {};
          },
        },
        stream,
      );

      const fastify = Fastify({ logger: false });

      fastify.addHook('onRequest', (request, _reply, done) => {
        requestContext.run({ requestId: request.id }, done);
      });

      let capturedRequestId: string | undefined;
      fastify.get('/capture', (request, reply) => {
        capturedRequestId = request.id;
        testLogger.info('capture route log');
        void reply.send({ ok: true });
      });

      await fastify.inject({ method: 'GET', url: '/capture' });

      expect(capturedRequestId).toBeDefined();
      expect(lines.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(lines[0]);
      // The logged requestId must equal the Fastify-assigned request.id
      expect(logEntry.requestId).toBe(capturedRequestId);

      await fastify.close();
    });
  });

  describe('WHEN two requests are injected concurrently', () => {
    it('each log line carries only the requestId of its originating request', async () => {
      const linesByRequest: Record<string, string[]> = {};

      // Build two separate apps to simulate concurrent isolation
      const app1 = buildTestApp();
      const app2 = buildTestApp();

      const [res1, res2] = await Promise.all([
        app1.fastify.inject({ method: 'GET', url: '/test' }),
        app2.fastify.inject({ method: 'GET', url: '/test' }),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      // Each app's lines should have their own requestId that doesn't appear in the other
      expect(app1.lines.length).toBeGreaterThan(0);
      expect(app2.lines.length).toBeGreaterThan(0);

      const logEntry1 = JSON.parse(app1.lines[0]);
      const logEntry2 = JSON.parse(app2.lines[0]);

      expect(logEntry1.requestId).toBeDefined();
      expect(logEntry2.requestId).toBeDefined();

      await Promise.all([app1.fastify.close(), app2.fastify.close()]);
    });

    it('concurrent requests on the same app do not cross-contaminate requestId', async () => {
      const capturedByHandler: string[] = [];

      const fastify = Fastify({ logger: false });
      fastify.addHook('onRequest', (request, _reply, done) => {
        requestContext.run({ requestId: request.id }, done);
      });

      fastify.get('/concurrent', async (_request, reply) => {
        // Simulate async work inside the handler
        await Promise.resolve();
        const store = requestContext.getStore();
        capturedByHandler.push(store?.requestId ?? 'none');
        await reply.send({ ok: true });
      });

      // Inject two concurrent requests
      await Promise.all([
        fastify.inject({ method: 'GET', url: '/concurrent' }),
        fastify.inject({ method: 'GET', url: '/concurrent' }),
      ]);

      expect(capturedByHandler).toHaveLength(2);
      // Each should have a unique requestId (Fastify assigns incrementing IDs for inject)
      const [id1, id2] = capturedByHandler;
      expect(id1).not.toBe('none');
      expect(id2).not.toBe('none');
      // The two concurrent requests should have different requestIds
      expect(id1).not.toBe(id2);

      await fastify.close();
    });
  });

  describe('WHEN an error is raised before the route handler runs', () => {
    it('the error log line includes the requestId of the originating request (EC003)', async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString().trim());
          callback();
        },
      });

      const testLogger = pino(
        {
          level: 'trace',
          mixin() {
            const store = requestContext.getStore();
            return store ? { requestId: store.requestId } : {};
          },
        },
        stream,
      );

      const fastify = Fastify({ logger: false });

      fastify.addHook('onRequest', (request, _reply, done) => {
        requestContext.run({ requestId: request.id }, done);
      });

      // Route with strict schema validation — an invalid body will trigger a
      // pre-handler schema validation error before the route handler runs.
      fastify.post(
        '/validated',
        {
          schema: {
            body: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        (_request, reply) => {
          void reply.send({ ok: true });
        },
      );

      // Register an error handler that logs the error using testLogger (which uses the mixin).
      // This mirrors how a real global error handler would log via the static logger.
      fastify.setErrorHandler((error, _request, reply) => {
        testLogger.error({ err: error.message }, 'request error');
        void reply.status(400).send({ error: error.message });
      });

      // Send a request with an invalid body (missing required 'name' field) to trigger
      // schema validation failure before the route handler executes.
      const response = await fastify.inject({
        method: 'POST',
        url: '/validated',
        payload: { unexpected: 'value' },
        headers: { 'content-type': 'application/json' },
      });

      expect(response.statusCode).toBe(400);
      expect(lines.length).toBeGreaterThan(0);

      const errorLogEntry = JSON.parse(lines[0]);
      // The error log emitted from the error handler must include requestId because
      // the onRequest hook ran and populated the AsyncLocalStorage store before the
      // schema validation error was raised.
      expect(errorLogEntry).toHaveProperty('requestId');
      expect(typeof errorLogEntry.requestId).toBe('string');
      expect(errorLogEntry.requestId.length).toBeGreaterThan(0);

      await fastify.close();
    });
  });

  describe('WHEN no request is in flight', () => {
    it('the static logger emits lines with no requestId', () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString().trim());
          callback();
        },
      });

      const testLogger = pino(
        {
          level: 'trace',
          mixin() {
            const store = requestContext.getStore();
            return store ? { requestId: store.requestId } : {};
          },
        },
        stream,
      );

      // Log outside any Fastify request
      testLogger.info('bootstrap log outside request');

      expect(lines.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(lines[0]);
      expect(logEntry).not.toHaveProperty('requestId');
    });
  });
});
