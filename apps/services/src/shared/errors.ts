export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, originalError?: unknown) {
    super('NOT_FOUND', `${resource} not found`, 404, originalError);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, originalError?: unknown) {
    super('VALIDATION_ERROR', message, 400, originalError);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(originalError?: unknown) {
    super('UNAUTHORIZED', 'Unauthorized', 401, originalError);
  }
}

export class ForbiddenError extends DomainError {
  constructor(originalError?: unknown) {
    super('FORBIDDEN', 'Forbidden', 403, originalError);
  }
}

export class EntitlementRequiredError extends DomainError {
  constructor(entitlement: string) {
    super('ENTITLEMENT_REQUIRED', `Entitlement required: ${entitlement}`, 403);
  }
}

export class ProviderError extends DomainError {
  constructor(message: string, statusCode: 400 | 502 = 502, originalError?: unknown) {
    super('PROVIDER_ERROR', message, statusCode, originalError);
  }
}

export class TrialExpiredError extends DomainError {
  constructor(public readonly trialEndedAt: string) {
    super('TRIAL_EXPIRED', 'Your trial has expired. Please select a plan to continue.', 403);
  }
}

export class ProgrammingError extends DomainError {
  constructor(message: string) {
    super('PROGRAMMING_ERROR', message, 500);
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(public readonly retryAfterSeconds: number = 2) {
    super(
      'SERVICE_UNAVAILABLE',
      'Identity resolution is still in progress. Please retry shortly.',
      503,
    );
  }
}

export class QuotaExceededError extends DomainError {
  constructor(
    public readonly quotaName: string,
    public readonly count: number,
    public readonly soft_limit: number,
    public readonly hard_limit: number,
    public readonly period_end: string,
  ) {
    super('QUOTA_EXCEEDED', `Quota exceeded: ${quotaName}`, 429);
  }
}
