import pino from 'pino';
import { Writable } from 'node:stream';
import { requestContext } from '../../../../src/shared/infrastructure/requestContext.js';

/**
 * Build a test logger that uses the same mixin logic as the real logger,
 * but writes to a Writable stream so we can capture log output.
 */
function buildTestLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
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

  return { testLogger, lines };
}

describe('logger mixin', () => {
  describe('WHEN logger.info is called outside any requestContext.run', () => {
    it('does NOT include a requestId field in the serialized log object', () => {
      const { testLogger, lines } = buildTestLogger();

      testLogger.info({ someField: 'value' }, 'outside request scope');

      expect(lines.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(lines[0]);
      expect(logEntry).not.toHaveProperty('requestId');
    });

    it('preserves all other fields unchanged', () => {
      const { testLogger, lines } = buildTestLogger();

      testLogger.info({ someField: 'value' }, 'message text');

      const logEntry = JSON.parse(lines[0]);
      expect(logEntry.msg).toBe('message text');
      expect(logEntry.someField).toBe('value');
      expect(logEntry.level).toBeDefined();
    });
  });

  describe('WHEN logger.info is called inside a requestContext.run', () => {
    it('includes requestId matching the one set in the store', (done) => {
      const { testLogger, lines } = buildTestLogger();

      requestContext.run({ requestId: 'test-id' }, () => {
        testLogger.info({ someField: 'value' }, 'inside request scope');

        const logEntry = JSON.parse(lines[0]);
        expect(logEntry.requestId).toBe('test-id');
        done();
      });
    });

    it('preserves all other fields unchanged when inside a request scope', (done) => {
      const { testLogger, lines } = buildTestLogger();

      requestContext.run({ requestId: 'test-id-2' }, () => {
        testLogger.info({ anotherField: 42 }, 'message inside request');

        const logEntry = JSON.parse(lines[0]);
        expect(logEntry.msg).toBe('message inside request');
        expect(logEntry.anotherField).toBe(42);
        expect(logEntry.level).toBeDefined();
        expect(logEntry.requestId).toBe('test-id-2');
        done();
      });
    });
  });
});
