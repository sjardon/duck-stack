import { NoopErrorReporter } from '../../../../src/shared/providers/noopErrorReporter.js';

// T006 — R008
describe('NoopErrorReporter.report — no-op (R008)', () => {
  it.each([undefined, null, 'not-an-error', new Error('boom'), { any: 'thing' }])(
    'WHEN report(%p) is called THEN it returns undefined and never throws',
    (input) => {
      const reporter = new NoopErrorReporter();

      let result: void;
      expect(() => {
        result = reporter.report(input);
      }).not.toThrow();
      expect(result).toBeUndefined();
    },
  );
});
