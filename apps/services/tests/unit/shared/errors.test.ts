import {
  DomainError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ProviderError,
  EntitlementRequiredError,
} from '../../../src/shared/errors.js';

// T001 — R001, R003: DomainError stores originalError
describe('DomainError — originalError parameter', () => {
  describe('WHEN DomainError is constructed with a fourth argument', () => {
    it('instance.originalError equals that argument (Error instance)', () => {
      const cause = new Error('cause');
      const err = new DomainError('SOME_CODE', 'some message', 500, cause);
      expect(err.originalError).toBe(cause);
    });

    it('instance.originalError equals that argument (plain object)', () => {
      const cause = { detail: 'some detail' };
      const err = new DomainError('SOME_CODE', 'some message', 400, cause);
      expect(err.originalError).toBe(cause);
    });

    it('instance.originalError equals that argument (string)', () => {
      const cause = 'raw string cause';
      const err = new DomainError('SOME_CODE', 'some message', 502, cause);
      expect(err.originalError).toBe(cause);
    });
  });

  describe('WHEN DomainError is constructed without a fourth argument', () => {
    it('instance.originalError is undefined', () => {
      const err = new DomainError('SOME_CODE', 'some message', 400);
      expect(err.originalError).toBeUndefined();
    });

    it('instance.originalError is undefined when only code and message are supplied', () => {
      const err = new DomainError('SOME_CODE', 'some message');
      expect(err.originalError).toBeUndefined();
    });
  });

  describe('core DomainError properties', () => {
    it('stores code, message, and statusCode correctly alongside originalError', () => {
      const cause = new Error('original');
      const err = new DomainError('MY_CODE', 'my message', 422, cause);
      expect(err.code).toBe('MY_CODE');
      expect(err.message).toBe('my message');
      expect(err.statusCode).toBe(422);
      expect(err.originalError).toBe(cause);
    });
  });
});

// T003 — R003: existing subclasses accept and store originalError
describe('DomainError subclasses — originalError parameter (R003)', () => {
  it('NotFoundError stores originalError on the instance', () => {
    const cause = new Error('cause');
    const err = new NotFoundError('User', cause);
    expect(err.originalError).toBe(cause);
  });

  it('ValidationError stores originalError on the instance', () => {
    const cause = { raw: 'validation failure' };
    const err = new ValidationError('Invalid input', cause);
    expect(err.originalError).toBe(cause);
  });

  it('UnauthorizedError stores originalError on the instance', () => {
    const cause = new Error('token expired');
    const err = new UnauthorizedError(cause);
    expect(err.originalError).toBe(cause);
  });

  it('ForbiddenError stores originalError on the instance', () => {
    const cause = 'insufficient permissions';
    const err = new ForbiddenError(cause);
    expect(err.originalError).toBe(cause);
  });

  it('ProviderError stores originalError on the instance (default statusCode)', () => {
    const cause = new Error('upstream failure');
    const err = new ProviderError('Provider failed', 502, cause);
    expect(err.originalError).toBe(cause);
  });

  it('ProviderError stores originalError on the instance (explicit statusCode 400)', () => {
    const cause = new Error('bad request to provider');
    const err = new ProviderError('Bad provider input', 400, cause);
    expect(err.originalError).toBe(cause);
  });
});

// T004 — R004: EntitlementRequiredError
describe('EntitlementRequiredError — construction (R004)', () => {
  it('WHEN constructed THEN code is ENTITLEMENT_REQUIRED', () => {
    const err = new EntitlementRequiredError('advanced_analytics');
    expect(err.code).toBe('ENTITLEMENT_REQUIRED');
  });

  it('WHEN constructed THEN statusCode is 403', () => {
    const err = new EntitlementRequiredError('api_access');
    expect(err.statusCode).toBe(403);
  });

  it('WHEN constructed THEN message contains the entitlement name', () => {
    const err = new EntitlementRequiredError('team_collaboration');
    expect(err.message).toContain('team_collaboration');
  });

  it('WHEN constructed THEN it is an instance of DomainError', () => {
    const err = new EntitlementRequiredError('white_label');
    expect(err).toBeInstanceOf(DomainError);
  });
});

// T003 — R002: existing subclasses construct without originalError
describe('DomainError subclasses — current call signatures', () => {
  it('NotFoundError is a DomainError with originalError undefined and correct fields', () => {
    const err = new NotFoundError('User');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.originalError).toBeUndefined();
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('User not found');
    expect(err.statusCode).toBe(404);
  });

  it('ValidationError is a DomainError with originalError undefined and correct fields', () => {
    const err = new ValidationError('Invalid input');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.originalError).toBeUndefined();
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid input');
    expect(err.statusCode).toBe(400);
  });

  it('UnauthorizedError is a DomainError with originalError undefined and correct fields', () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.originalError).toBeUndefined();
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Unauthorized');
    expect(err.statusCode).toBe(401);
  });

  it('ForbiddenError is a DomainError with originalError undefined and correct fields', () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.originalError).toBeUndefined();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
    expect(err.statusCode).toBe(403);
  });

  it('ProviderError is a DomainError with originalError undefined and correct fields (default statusCode)', () => {
    const err = new ProviderError('Provider failed');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.originalError).toBeUndefined();
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.message).toBe('Provider failed');
    expect(err.statusCode).toBe(502);
  });

  it('ProviderError is a DomainError with originalError undefined and correct fields (explicit statusCode 400)', () => {
    const err = new ProviderError('Bad provider input', 400);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.originalError).toBeUndefined();
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.message).toBe('Bad provider input');
    expect(err.statusCode).toBe(400);
  });
});
