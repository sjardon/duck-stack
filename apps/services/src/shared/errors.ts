export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super('UNAUTHORIZED', 'Unauthorized', 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor() {
    super('FORBIDDEN', 'Forbidden', 403);
  }
}

export class ProviderError extends DomainError {
  constructor(message: string, statusCode: 400 | 502 = 502) {
    super('PROVIDER_ERROR', message, statusCode);
  }
}
