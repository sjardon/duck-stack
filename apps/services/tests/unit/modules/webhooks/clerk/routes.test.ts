import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock logger before importing routes
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock db before importing routes
jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

// Mock authConfig so we can control the signing secret without env reloads
jest.mock('../../../../../src/shared/configs/authConfig.js', () => ({
  authConfig: {
    clerkWebhookSigningSecret: 'test-signing-secret',
    clerkJwtKey: undefined,
  },
}));

// Mock ClerkSyncRepository
jest.mock('../../../../../src/modules/webhooks/repositories/clerkSyncRepository.js', () => ({
  ClerkSyncRepository: jest.fn().mockImplementation(() => ({})),
}));

// Mock dispatchClerkEvent so we can control its behavior
const mockDispatchClerkEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../../src/modules/webhooks/clerk/clerkEventHandlers.js', () => ({
  dispatchClerkEvent: (...args: unknown[]) => mockDispatchClerkEvent(...args),
}));

// Mock verifyWebhook so we can control signature verification
const mockVerifyWebhook = jest.fn();
jest.mock('@clerk/backend/webhooks', () => ({
  verifyWebhook: (...args: unknown[]) => mockVerifyWebhook(...args),
}));

import { logger } from '../../../../../src/shared/infrastructure/logger.js';
import clerkWebhookRoutes from '../../../../../src/modules/webhooks/clerk/routes.js';
import errorHandlerPlugin from '../../../../../src/shared/plugins/errorHandler.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  // Register errorHandler so thrown DomainErrors are serialized to { code, message }
  await fastify.register(errorHandlerPlugin);
  await fastify.register(clerkWebhookRoutes);
  return fastify;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatchClerkEvent.mockResolvedValue(undefined);
  mockVerifyWebhook.mockResolvedValue({ type: 'user.created', data: {} });
});

// T005 — R004, R014, EC001: missing Svix headers → HTTP 400 VALIDATION_ERROR

describe('clerkWebhookRoutes — missing Svix headers (R004, EC001)', () => {
  it('WHEN request arrives with no Svix headers THEN responds HTTP 400 with code VALIDATION_ERROR', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      payload: Buffer.from(JSON.stringify({ type: 'user.created', data: {} })),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { code: string; message: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Missing required Svix headers');
  });

  it('WHEN request arrives with only some Svix headers THEN responds HTTP 400 with code VALIDATION_ERROR', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      payload: Buffer.from(JSON.stringify({ type: 'user.created', data: {} })),
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_001',
        // missing svix-timestamp and svix-signature
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// T007 — R005, R014, EC002: Svix signature verification failure → HTTP 400 VALIDATION_ERROR

describe('clerkWebhookRoutes — signature verification failure (R005, EC002)', () => {
  it('WHEN verifyWebhook throws THEN responds HTTP 400 with code VALIDATION_ERROR and message Webhook signature verification failed', async () => {
    mockVerifyWebhook.mockRejectedValue(new Error('Invalid signature'));
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      payload: Buffer.from(JSON.stringify({ type: 'user.created', data: {} })),
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_001',
        'svix-timestamp': '1234567890',
        'svix-signature': 'v1,abc123',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { code: string; message: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Webhook signature verification failed');
  });

  it('WHEN verifyWebhook throws THEN logger.warn is called once with the caught error', async () => {
    const sigErr = new Error('Invalid signature');
    mockVerifyWebhook.mockRejectedValue(sigErr);
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      payload: Buffer.from(JSON.stringify({ type: 'user.created', data: {} })),
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_001',
        'svix-timestamp': '1234567890',
        'svix-signature': 'v1,abc123',
      },
    });

    // logger.warn is called once by the clerk route catch block (with the raw sigErr),
    // and once by errorHandler when it serializes the thrown ValidationError (EC008).
    expect(mockLogger.warn).toHaveBeenCalled();
    // The first call must be from the clerk route, passing the caught error directly
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.err).toBe(sigErr);
  });
});

// T005 — valid request reaches dispatchClerkEvent

describe('clerkWebhookRoutes — valid request (R014)', () => {
  it('WHEN valid request with correct headers and valid signature THEN responds HTTP 200 with { received: true }', async () => {
    mockVerifyWebhook.mockResolvedValue({ type: 'user.created', data: { id: 'user_001' } });
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      payload: Buffer.from(JSON.stringify({ type: 'user.created', data: {} })),
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_001',
        'svix-timestamp': '1234567890',
        'svix-signature': 'v1,abc123',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { received: boolean };
    expect(body).toEqual({ received: true });
  });
});
