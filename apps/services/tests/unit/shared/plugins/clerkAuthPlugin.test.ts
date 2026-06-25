// Mock logger before any imports
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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

// Mock authConfig to control jwtKey without env reloads
jest.mock('../../../../src/shared/configs/authConfig.js', () => ({
  authConfig: {
    clerkJwtKey: undefined,
    clerkWebhookSigningSecret: undefined,
  },
}));

// Mock verifyToken so we can control JWT verification behavior
const mockVerifyToken = jest.fn();
jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { logger } from '../../../../src/shared/infrastructure/logger.js';
import clerkAuthPlugin from '../../../../src/shared/plugins/clerkAuthPlugin.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

async function buildApp(): Promise<FastifyInstance> {
  process.env.CLERK_SECRET_KEY = 'test-secret-key';

  const fastify = Fastify({ logger: false });
  await fastify.register(clerkAuthPlugin);

  // A simple route that echoes back userId to verify the plugin behavior
  fastify.get('/me', async (request) => {
    return { userId: (request as { userId?: string }).userId ?? null };
  });

  return fastify;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CLERK_SECRET_KEY = 'test-secret-key';
});

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
});

// T016 — R011, R013, EC004: JWT verification failure → logger.warn and userId undefined

describe('clerkAuthPlugin — JWT verification failure (R011, R013, EC004)', () => {
  it('WHEN verifyToken throws THEN logger.warn is called with the caught error', async () => {
    const jwtErr = new Error('JWT verification failed: invalid signature');
    mockVerifyToken.mockRejectedValue(jwtErr);

    const app = await buildApp();

    await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(jwtErr);
  });

  it('WHEN verifyToken throws THEN request.userId remains undefined', async () => {
    mockVerifyToken.mockRejectedValue(new Error('expired token'));

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer expired.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { userId: string | null };
    expect(body.userId).toBeNull();
  });

  it('WHEN no Authorization header is present THEN logger.warn is not called and request proceeds', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
    });

    expect(response.statusCode).toBe(200);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('WHEN verifyToken succeeds THEN request.userId is set and logger.warn is not called', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc', org_id: null });

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { userId: string | null };
    expect(body.userId).toBe('user_abc');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
