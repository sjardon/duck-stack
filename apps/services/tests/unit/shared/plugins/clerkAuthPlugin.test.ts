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

// Mock db and clerkClient singletons — no real connections in unit tests
jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));
jest.mock('../../../../src/shared/infrastructure/clerkClient.js', () => ({ clerkClient: {} }));

// Mock IdentityDBRepository so we control the degraded-path DB lookup
const mockFindUserIdByClerkUserId = jest.fn();
const mockFindOrgIdByClerkOrgId = jest.fn();
jest.mock('../../../../src/shared/repositories/identityDBRepository.js', () => ({
  IdentityDBRepository: jest.fn().mockImplementation(() => ({
    findUserIdByClerkUserId: (...args: unknown[]) => mockFindUserIdByClerkUserId(...args),
    findOrgIdByClerkOrgId: (...args: unknown[]) => mockFindOrgIdByClerkOrgId(...args),
  })),
}));

// Mock ClerkMetadataProvider so we control/observe the fire-and-forget backfill
const mockSetUserAppId = jest.fn();
const mockSetOrgAppId = jest.fn();
jest.mock('../../../../src/shared/providers/clerkMetadataProvider.js', () => ({
  ClerkMetadataProvider: jest.fn().mockImplementation(() => ({
    setUserAppId: (...args: unknown[]) => mockSetUserAppId(...args),
    setOrgAppId: (...args: unknown[]) => mockSetOrgAppId(...args),
  })),
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

type EchoBody = {
  userId: string | null;
  orgId: string | null;
  clerkUserId: string | null;
  clerkOrgId: string | null;
};

async function buildApp(): Promise<FastifyInstance> {
  process.env.CLERK_SECRET_KEY = 'test-secret-key';

  const fastify = Fastify({ logger: false });
  await fastify.register(clerkAuthPlugin);

  fastify.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const retryAfterSeconds = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
    if (retryAfterSeconds !== undefined) {
      reply.header('Retry-After', String(retryAfterSeconds));
    }
    reply.status(statusCode).send({ code: (error as { code?: string }).code ?? 'INTERNAL_ERROR' });
  });

  // A simple route that echoes back the decorated identity fields
  fastify.get('/me', async (request) => {
    const req = request as unknown as EchoBody;
    return {
      userId: req.userId ?? null,
      orgId: req.orgId ?? null,
      clerkUserId: req.clerkUserId ?? null,
      clerkOrgId: req.clerkOrgId ?? null,
    };
  });

  return fastify;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CLERK_SECRET_KEY = 'test-secret-key';
  mockFindUserIdByClerkUserId.mockResolvedValue(null);
  mockFindOrgIdByClerkOrgId.mockResolvedValue(null);
  mockSetUserAppId.mockResolvedValue(undefined);
  mockSetOrgAppId.mockResolvedValue(undefined);
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
    const body = JSON.parse(response.body) as EchoBody;
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
});

// T013 — R004: raw Clerk ID decoration
describe('clerkAuthPlugin — raw Clerk ID decoration (R004)', () => {
  it('WHEN a valid JWT carries sub and org_id THEN request.clerkUserId/clerkOrgId mirror the raw claims', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: 'user_abc',
      org_id: 'org_xyz',
      app_user_id: 'internal-user-001',
      app_org_id: 'internal-org-001',
    });

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as EchoBody;
    expect(body.clerkUserId).toBe('user_abc');
    expect(body.clerkOrgId).toBe('org_xyz');
  });
});

// T015 — R001, NF001: userId fast path via app_user_id claim
describe('clerkAuthPlugin — userId fast path (R001, NF001)', () => {
  it('WHEN the JWT payload includes app_user_id THEN request.userId equals the claim and no DB/metadata call is made', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: 'user_abc',
      org_id: null,
      app_user_id: 'internal-user-001',
    });

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as EchoBody;
    expect(body.userId).toBe('internal-user-001');
    expect(mockFindUserIdByClerkUserId).not.toHaveBeenCalled();
    expect(mockSetUserAppId).not.toHaveBeenCalled();
  });
});

// T017 — R006, R007, R008, NF002: degraded-path resolution and 503 fallback for userId
describe('clerkAuthPlugin — userId degraded path and 503 fallback (R006, R007, R008, NF002)', () => {
  it('WHEN app_user_id is absent and the identity repository resolves within budget THEN request.userId is set and the response is not 503', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc', org_id: null });
    mockFindUserIdByClerkUserId.mockResolvedValue('internal-user-001');

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as EchoBody;
    expect(body.userId).toBe('internal-user-001');
  });

  it('WHEN the identity repository never resolves within budget THEN the response is 503 with a Retry-After header', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc', org_id: null });
    mockFindUserIdByClerkUserId.mockResolvedValue(null);

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBeDefined();
  }, 10000);
});

// T019 — R002, R003, EC005: orgId resolution and no-org case
describe('clerkAuthPlugin — orgId resolution (R002, R003, EC005)', () => {
  it('WHEN the JWT has no org_id claim THEN request.orgId is null and the org lookup is never called', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc', org_id: null, app_user_id: 'internal-user-001' });

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as EchoBody;
    expect(body.orgId).toBeNull();
    expect(mockFindOrgIdByClerkOrgId).not.toHaveBeenCalled();
  });

  it('WHEN org_id and app_org_id are both present THEN request.orgId equals app_org_id with no DB call', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: 'user_abc',
      org_id: 'org_xyz',
      app_user_id: 'internal-user-001',
      app_org_id: 'internal-org-001',
    });

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as EchoBody;
    expect(body.orgId).toBe('internal-org-001');
    expect(mockFindOrgIdByClerkOrgId).not.toHaveBeenCalled();
  });

  it('WHEN org_id is present but app_org_id is absent THEN request.orgId resolves via the identity repository', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: 'user_abc',
      org_id: 'org_xyz',
      app_user_id: 'internal-user-001',
    });
    mockFindOrgIdByClerkOrgId.mockResolvedValue('internal-org-001');

    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as EchoBody;
    expect(body.orgId).toBe('internal-org-001');
  });

  it('WHEN two sequential requests carry different org_id claims THEN each produces the matching request.orgId with no stale value', async () => {
    const app = await buildApp();

    mockVerifyToken.mockResolvedValue({
      sub: 'user_abc',
      org_id: 'org_first',
      app_user_id: 'internal-user-001',
      app_org_id: 'internal-org-first',
    });
    const firstResponse = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });
    expect((JSON.parse(firstResponse.body) as EchoBody).orgId).toBe('internal-org-first');

    mockVerifyToken.mockResolvedValue({
      sub: 'user_abc',
      org_id: 'org_second',
      app_user_id: 'internal-user-001',
      app_org_id: 'internal-org-second',
    });
    const secondResponse = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid.jwt.token' },
    });
    expect((JSON.parse(secondResponse.body) as EchoBody).orgId).toBe('internal-org-second');
  });
});
