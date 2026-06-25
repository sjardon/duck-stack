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

export class ProviderError extends DomainError {
  constructor(message: string, statusCode: 400 | 502 = 502, originalError?: unknown) {
    super('PROVIDER_ERROR', message, statusCode, originalError);
  }
}
