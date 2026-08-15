import * as Sentry from '@sentry/node';
import { logger } from '../infrastructure/logger.js';
import type { errorTrackingConfig } from '../configs/errorTrackingConfig.js';
import type { IErrorReporter, ErrorReportContext } from './errorReporter.js';
import { ErrorOccurrenceSampler } from './errorOccurrenceSampler.js';

type ErrorTrackingConfig = typeof errorTrackingConfig;

export class SentryErrorReporter implements IErrorReporter {
  private readonly sampler: ErrorOccurrenceSampler;

  constructor(config: ErrorTrackingConfig) {
    this.sampler = new ErrorOccurrenceSampler(config.sampleRate);
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      sendDefaultPii: false,
      beforeSend: (event) => this.beforeSend(event),
    });
  }

  report(error: unknown, context: ErrorReportContext = {}): void {
    try {
      Sentry.withScope((scope) => {
        if (context.requestId) scope.setTag('requestId', context.requestId);
        Sentry.captureException(error);
      });
    } catch (err) {
      logger.error({ err }, 'Failed to report error to error tracking provider');
    }
  }

  // Strips request/user data as defense in depth — no request-data
  // integration is registered, so event.request/event.user should already be
  // empty, but this guarantees no secret/PII field can ever leak — and gates
  // repeat occurrences through the sampler.
  private beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
    delete event.request;
    delete event.user;
    const fingerprint = fingerprintFor(event);
    if (!this.sampler.shouldSend(fingerprint)) return null;
    return event;
  }
}

export function fingerprintFor(event: Sentry.ErrorEvent): string {
  const exceptionValue = event.exception?.values?.[0];
  return `${exceptionValue?.type ?? 'unknown'}:${exceptionValue?.value ?? ''}`;
}
