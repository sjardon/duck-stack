import type { IErrorReporter, ErrorReportContext } from './errorReporter.js';

// Used when error tracking configuration is absent — startup and operation
// must never be blocked by the instrumentation being disabled.
export class NoopErrorReporter implements IErrorReporter {
  report(error: unknown, context?: ErrorReportContext): void {
    // Intentionally a no-op — error tracking is disabled.
    void error;
    void context;
  }
}
