import { requestContext } from '../../../../src/shared/infrastructure/requestContext.js';

describe('requestContext', () => {
  describe('WHEN code runs outside any run call', () => {
    it('getStore() returns undefined', () => {
      const store = requestContext.getStore();
      expect(store).toBeUndefined();
    });
  });

  describe('WHEN code runs inside a run call', () => {
    it('getStore() returns the store set for that run', (done) => {
      requestContext.run({ requestId: 'req-abc' }, () => {
        const store = requestContext.getStore();
        expect(store).toEqual({ requestId: 'req-abc' });
        done();
      });
    });
  });

  describe('WHEN two run calls execute concurrently', () => {
    it('each async chain reads only its own requestId from getStore()', async () => {
      const results: Array<{ label: string; requestId: string | undefined }> = [];

      const firstDone = new Promise<void>((resolve) => {
        requestContext.run({ requestId: 'req-first' }, () => {
          // Simulate async work
          setImmediate(() => {
            results.push({ label: 'first', requestId: requestContext.getStore()?.requestId });
            resolve();
          });
        });
      });

      const secondDone = new Promise<void>((resolve) => {
        requestContext.run({ requestId: 'req-second' }, () => {
          setImmediate(() => {
            results.push({ label: 'second', requestId: requestContext.getStore()?.requestId });
            resolve();
          });
        });
      });

      await Promise.all([firstDone, secondDone]);

      const first = results.find((r) => r.label === 'first');
      const second = results.find((r) => r.label === 'second');

      expect(first?.requestId).toBe('req-first');
      expect(second?.requestId).toBe('req-second');
    });

    it('stores do not bleed between concurrent async chains across await boundaries', async () => {
      const capturedIds: Record<string, string | undefined> = {};

      const runAsync = (requestId: string) =>
        new Promise<void>((resolve) => {
          requestContext.run({ requestId }, async () => {
            // Cross an await boundary
            await Promise.resolve();
            capturedIds[requestId] = requestContext.getStore()?.requestId;
            resolve();
          });
        });

      await Promise.all([runAsync('req-A'), runAsync('req-B')]);

      expect(capturedIds['req-A']).toBe('req-A');
      expect(capturedIds['req-B']).toBe('req-B');
    });
  });
});
