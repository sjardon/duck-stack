import { logger } from '../infrastructure/logger.js';
import { errorTrackingConfig } from '../configs/errorTrackingConfig.js';
import { SentryErrorReporter } from './sentryErrorReporter.js';
import { NoopErrorReporter } from './noopErrorReporter.js';

export interface ErrorReportContext {
  requestId?: string;
}

export interface IErrorReporter {
  report(error: unknown, context?: ErrorReportContext): void;
}

export function createErrorReporter(): IErrorReporter {
  if (!errorTrackingConfig.enabled) {
    logger.info('Error tracking disabled: ERROR_TRACKING_DSN not set');
    return new NoopErrorReporter();
  }
  return new SentryErrorReporter(errorTrackingConfig);
}

// Module-scope singleton, mirroring logger.ts: a single shared instance, not
// per-request/per-call. Eager ESM import resolution guarantees this — and,
// when enabled, Sentry.init(...) inside it — runs before fastify.listen().
export const errorReporter: IErrorReporter = createErrorReporter();
