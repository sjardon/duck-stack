import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { DomainError, NotFoundError, ValidationError, ServiceUnavailableError } from '../../../../src/shared/errors.js';

// Mock the static logger so we can spy on its methods
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock serverConfig to avoid env var requirements
jest.mock('../../../../src/shared/configs/serverConfig.js', () => ({
  serverConfig: {
    port: 3000,
    host: '0.0.0.0',
    nodeEnv: 'test',
    logLevel: 'silent',
  },
}));

// Mock requestContext to avoid ALS side effects
jest.mock('../../../../src/shared/infrastructure/requestContext.js', () => ({
  requestContext: {
    getStore: jest.fn().mockReturnValue(null),
    run: jest.fn((_store: unknown, cb: () => void) => cb()),
  },
}));

// Mock errorReporter to assert reporting calls without hitting a real provider
jest.mock('../../../../src/shared/providers/errorReporter.js', () => ({
  errorReporter: {
    report: jest.fn(),
  },
}));

import { logger } from '../../../../src/shared/infrastructure/logger.js';
import { requestContext } from '../../../../src/shared/infrastructure/requestContext.js';
import { errorReporter } from '../../../../src/shared/providers/errorReporter.js';
import errorHandlerPlugin from '../../../../src/shared/plugins/errorHandler.js';

const mockLogger = logger as unknown as {
  warn: jest.Mock;
  error: jest.Mock;
  info: jest.Mock;
};

const mockRequestContext = requestContext as unknown as {
  getStore: jest.Mock;
  run: jest.Mock;
};

const mockErrorReporter = errorReporter as unknown as {
  report: jest.Mock;
};

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(errorHandlerPlugin);
  return fastify;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestContext.getStore.mockReturnValue(null);
});

// T004 — R004, R005: DomainError 4xx logs at warn level
describe('errorHandler — DomainError with statusCode < 500', () => {
  it('WHEN errorHandler intercepts a DomainError with statusCode < 500 THEN logger.warn is called once before reply', async () => {
    const fastify = await buildApp();
    const domainErr = new NotFoundError('Resource');

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a DomainError with statusCode < 500 THEN warn payload contains code, message, statusCode, and originalError', async () => {
    const fastify = await buildApp();
    const cause = new Error('upstream cause');
    const domainErr = new DomainError('NOT_FOUND', 'Resource not found', 404, cause);

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Resource not found',
      statusCode: 404,
      originalError: cause,
    });

    await fastify.close();
  });
});

// T005 — R004, R006: DomainError 5xx logs at error level with stack
describe('errorHandler — DomainError with statusCode >= 500', () => {
  it('WHEN errorHandler intercepts a DomainError with statusCode >= 500 THEN logger.error is called once', async () => {
    const fastify = await buildApp();
    const domainErr = new DomainError('INTERNAL', 'Internal domain error', 500);

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a DomainError with statusCode >= 500 THEN error payload contains code, message, statusCode, stack, and originalError', async () => {
    const fastify = await buildApp();
    const cause = new Error('db error');
    const domainErr = new DomainError('DB_ERROR', 'Database failure', 500, cause);

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      code: 'DB_ERROR',
      message: 'Database failure',
      statusCode: 500,
      originalError: cause,
    });
    expect(typeof payload.stack).toBe('string');
    expect((payload.stack as string).length).toBeGreaterThan(0);

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a DomainError with statusCode 502 THEN logger.error is called (>= 500 branch)', async () => {
    const fastify = await buildApp();
    const domainErr = new DomainError('PROVIDER_ERROR', 'Provider failed', 502);

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockLogger.error).toHaveBeenCalledTimes(1);

    await fastify.close();
  });
});

// T006 — R004, R007, NF003: non-DomainError logs at error level
describe('errorHandler — non-DomainError', () => {
  it('WHEN errorHandler intercepts a plain Error THEN logger.error is called once', async () => {
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('something went wrong');
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a plain Error THEN error payload contains message, stack, and originalError equal to the raw error', async () => {
    const fastify = await buildApp();
    const rawError = new Error('raw internal error');

    fastify.get('/test', () => {
      throw rawError;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    const [payload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      message: 'raw internal error',
      originalError: rawError,
    });
    expect(typeof payload.stack).toBe('string');

    await fastify.close();
  });
});

// T007 — R008: DomainError reply uses error.statusCode and { code, message }
describe('errorHandler — DomainError HTTP response', () => {
  it('WHEN errorHandler intercepts a DomainError THEN HTTP status equals error.statusCode', async () => {
    const fastify = await buildApp();
    const domainErr = new ValidationError('Invalid email');

    fastify.get('/test', () => {
      throw domainErr;
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(400);

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a DomainError THEN body is { code, message } with no additional fields', async () => {
    const fastify = await buildApp();
    const cause = new Error('original');
    const domainErr = new DomainError('NOT_FOUND', 'User not found', 404, cause);

    fastify.get('/test', () => {
      throw domainErr;
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(body).toEqual({ code: 'NOT_FOUND', message: 'User not found' });

    await fastify.close();
  });
});

// T008 — R009, R010: non-DomainError reply is always INTERNAL_ERROR/500
describe('errorHandler — non-DomainError HTTP response', () => {
  it('WHEN errorHandler intercepts a non-DomainError THEN HTTP status is 500', async () => {
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('unexpected failure');
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(500);

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a non-DomainError THEN body is exactly { code: INTERNAL_ERROR, message: Internal server error }', async () => {
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('unexpected failure');
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });

    await fastify.close();
  });

  it('WHEN errorHandler intercepts an Error with a statusCode property (Fastify-style) THEN still replies with INTERNAL_ERROR/500', async () => {
    const fastify = await buildApp();

    fastify.get('/test', () => {
      const err = new Error('not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(response.statusCode).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });

    await fastify.close();
  });
});

// T003 — R007: ServiceUnavailableError serializes with Retry-After header
describe('errorHandler — ServiceUnavailableError (R007)', () => {
  it('WHEN errorHandler intercepts a ServiceUnavailableError THEN replies 503 with Retry-After header and { code, message } body', async () => {
    const fastify = await buildApp();
    const err = new ServiceUnavailableError();

    fastify.get('/test', () => {
      throw err;
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('2');
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).toEqual({ code: 'SERVICE_UNAVAILABLE', message: err.message });

    await fastify.close();
  });

  it('WHEN errorHandler intercepts a ServiceUnavailableError with a custom retryAfterSeconds THEN Retry-After reflects it', async () => {
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new ServiceUnavailableError(7);
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('7');

    await fastify.close();
  });
});

// T009 — R010, NF002: response body never leaks originalError or stack
describe('errorHandler — response body never leaks internal fields', () => {
  it('WHEN errorHandler replies for a DomainError with originalError THEN body has only code and message', async () => {
    const fastify = await buildApp();
    const cause = new Error('root cause');
    const domainErr = new DomainError('FORBIDDEN', 'Forbidden', 403, cause);

    fastify.get('/test', () => {
      throw domainErr;
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(Object.keys(body)).toEqual(['code', 'message']);
    expect(body.originalError).toBeUndefined();
    expect(body.stack).toBeUndefined();

    await fastify.close();
  });

  it('WHEN errorHandler replies for a non-DomainError THEN body has only code and message', async () => {
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('internal details that must not leak');
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(Object.keys(body)).toEqual(['code', 'message']);
    expect(body.originalError).toBeUndefined();
    expect(body.stack).toBeUndefined();

    await fastify.close();
  });
});

// T017 — R001, R003: reportable errors are sent to the error tracker with the requestId
describe('errorHandler — reports reportable errors to the error tracker (R001, R003)', () => {
  it('WHEN a non-DomainError reaches the error handler THEN errorReporter.report is called with that error and the current requestId', async () => {
    mockRequestContext.getStore.mockReturnValue({ requestId: 'req-abc' });
    const fastify = await buildApp();
    const rawError = new Error('unexpected failure');

    fastify.get('/test', () => {
      throw rawError;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockErrorReporter.report).toHaveBeenCalledTimes(1);
    expect(mockErrorReporter.report).toHaveBeenCalledWith(rawError, { requestId: 'req-abc' });

    await fastify.close();
  });

  it('WHEN a DomainError with statusCode >= 500 reaches the error handler THEN errorReporter.report is called with that error and the current requestId', async () => {
    mockRequestContext.getStore.mockReturnValue({ requestId: 'req-def' });
    const fastify = await buildApp();
    const domainErr = new DomainError('DB_ERROR', 'Database failure', 500);

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockErrorReporter.report).toHaveBeenCalledTimes(1);
    expect(mockErrorReporter.report).toHaveBeenCalledWith(domainErr, { requestId: 'req-def' });

    await fastify.close();
  });
});

// T018 — EC003: expected 4xx DomainErrors are never reported
describe('errorHandler — skips reporting for expected 4xx errors (EC003)', () => {
  it.each([
    ['ValidationError', () => new ValidationError('Invalid email')],
    ['NotFoundError', () => new NotFoundError('Resource')],
  ])('WHEN a %s reaches the error handler THEN errorReporter.report is never called', async (_name, makeError) => {
    const fastify = await buildApp();
    const domainErr = makeError();

    fastify.get('/test', () => {
      throw domainErr;
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockErrorReporter.report).not.toHaveBeenCalled();

    await fastify.close();
  });
});

// T019 — EC005: no requestId available outside the request context
describe('errorHandler — omits requestId outside request context (EC005)', () => {
  it('WHEN requestContext.getStore() returns null THEN errorReporter.report is still called with requestId left undefined', async () => {
    mockRequestContext.getStore.mockReturnValue(null);
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('boom');
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockErrorReporter.report).toHaveBeenCalledTimes(1);
    const [, context] = mockErrorReporter.report.mock.calls[0] as [unknown, { requestId?: string }];
    expect(context.requestId).toBeUndefined();

    await fastify.close();
  });

  it('WHEN requestContext.getStore() returns undefined THEN errorReporter.report is still called with requestId left undefined', async () => {
    mockRequestContext.getStore.mockReturnValue(undefined);
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('boom');
    });

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(mockErrorReporter.report).toHaveBeenCalledTimes(1);
    const [, context] = mockErrorReporter.report.mock.calls[0] as [unknown, { requestId?: string }];
    expect(context.requestId).toBeUndefined();

    await fastify.close();
  });
});

// T020 — NF001, NF002: the reply is independent of the reporter
describe('errorHandler — reply is independent of the reporter (NF001, NF002)', () => {
  it('WHEN errorReporter.report throws synchronously THEN the HTTP response is still sent with the correct status/body', async () => {
    mockErrorReporter.report.mockImplementation(() => {
      throw new Error('provider unreachable');
    });
    const fastify = await buildApp();

    fastify.get('/test', () => {
      throw new Error('boom');
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(response.statusCode).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });

    await fastify.close();
  });
});
