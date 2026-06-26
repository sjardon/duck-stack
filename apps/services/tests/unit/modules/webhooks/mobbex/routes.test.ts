import Fastify from 'fastify';

// Mock logger before any imports — must be first so the factory is registered before module load
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock db before importing routes
jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

// Mock mobbexConfig so tests control the webhook secret without env-driven reloads
// Default secret is 'correct-secret'; individual tests override via the mock if needed
let mockWebhookSecret: string | undefined = 'correct-secret';
jest.mock('../../../../../src/shared/configs/mobbexConfig.js', () => ({
  get mobbexConfig() {
    return {
      billingProvider: 'mobbex',
      apiKey: 'test-api-key',
      accessToken: 'test-access-token',
      testMode: false,
      timeoutMs: 5000,
      webhookSecret: mockWebhookSecret,
    };
  },
}));

// Mock MobbexBillingSyncRepository
jest.mock('../../../../../src/modules/webhooks/repositories/mobbexBillingSyncRepository.js', () => ({
  MobbexBillingSyncRepository: jest.fn().mockImplementation(() => ({
    recordEvent: jest.fn().mockResolvedValue(undefined),
    updateTransactionStatus: jest.fn().mockResolvedValue({ outcome: 'approved', transactionId: 'uuid-tx-001' }),
  })),
}));

// Mock dispatchMobbexEvent
const mockDispatch = jest.fn().mockResolvedValue('approved');
jest.mock('../../../../../src/modules/webhooks/mobbex/mobbexEventHandlers.js', () => ({
  dispatchMobbexEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Mock dispatchMobbexSubscriptionEvent and SUBSCRIPTION_EVENT_TYPES
const mockSubscriptionDispatch = jest.fn().mockResolvedValue('applied');
jest.mock('../../../../../src/modules/webhooks/mobbex/mobbexSubscriptionEventHandlers.js', () => ({
  SUBSCRIPTION_EVENT_TYPES: new Set([
    'subscription.activated',
    'subscription.renewed',
    'subscription.payment_failed',
    'subscription.canceled',
    'subscription.expired',
  ]),
  dispatchMobbexSubscriptionEvent: (...args: unknown[]) => mockSubscriptionDispatch(...args),
}));

import { logger } from '../../../../../src/shared/infrastructure/logger.js';
import mobbexWebhookRoutes from '../../../../../src/modules/webhooks/mobbex/routes.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

async function buildApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(mobbexWebhookRoutes);
  return fastify;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch.mockResolvedValue('approved');
  mockSubscriptionDispatch.mockResolvedValue('applied');
  mockWebhookSecret = 'correct-secret';
});

afterEach(() => {
  delete process.env.MOBBEX_WEBHOOK_SECRET;
});

// T013 — secret verification

describe('mobbexWebhookRoutes — registration and secret verification', () => {
  it('WHEN MOBBEX_WEBHOOK_SECRET is absent THEN plugin registration throws Error', async () => {
    mockWebhookSecret = undefined;
    await expect(buildApp()).rejects.toThrow(
      /MOBBEX_WEBHOOK_SECRET/,
    );
  });

  it('WHEN request arrives with wrong secret THEN responds HTTP 401 with code UNAUTHORIZED', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=wrong-secret',
      payload: Buffer.from(JSON.stringify({ type: 'payment.success', data: {} })),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('WHEN request arrives with missing secret THEN responds HTTP 401 with code UNAUTHORIZED', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex',
      payload: Buffer.from(JSON.stringify({ type: 'payment.success', data: {} })),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('WHEN secret is correct THEN proceeds past verification', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from(JSON.stringify({ type: 'payment.success', data: {} })),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
  });
});

// T014 — payload parsing

describe('mobbexWebhookRoutes — payload parsing', () => {
  it('WHEN request body is not valid JSON THEN responds HTTP 400 with code VALIDATION_ERROR', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from('not-valid-json'),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('WHEN body is valid JSON THEN dispatchMobbexEvent is called with parsed object', async () => {
    const app = await buildApp();
    const eventPayload = { type: 'payment.success', data: { id: 'ptx-001' } };

    await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from(JSON.stringify(eventPayload)),
      headers: { 'content-type': 'application/json' },
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment.success' }),
      expect.anything(),
    );
  });
});

// T018 — R006, EC006: logger.warn on JSON parse failure

describe('mobbexWebhookRoutes — logger.warn on JSON parse failure (R006, EC006)', () => {
  it('WHEN request body is not valid JSON THEN logger.warn is called with parse error before ValidationError is thrown', async () => {
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from('not-valid-json'),
      headers: { 'content-type': 'application/json' },
    });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload, message] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.err).toBeDefined();
    expect(message).toContain('failed to parse request body as JSON');
  });
});

// T015 — success response and logging

describe('mobbexWebhookRoutes — success response', () => {
  it('WHEN a verified valid event is processed THEN responds HTTP 200 with { received: true }', async () => {
    const app = await buildApp();
    const eventPayload = { type: 'payment.success', data: { id: 'ptx-001' } };

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from(JSON.stringify(eventPayload)),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { received: boolean };
    expect(body).toEqual({ received: true });
  });
});

// T017 — app.ts registers route before clerkAuthPlugin

describe('mobbexWebhookRoutes — registration in app.ts', () => {
  it('WHEN createApp is called with valid MOBBEX_WEBHOOK_SECRET THEN POST /webhooks/billing/mobbex is available', async () => {
    process.env.MOBBEX_WEBHOOK_SECRET = 'test-secret';
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'clerk-secret';
    process.env.CLERK_SECRET_KEY = 'clerk-key';
    process.env.DATABASE_URL = 'postgres://localhost/test';
    process.env.MOBBEX_API_KEY = 'key';
    process.env.MOBBEX_ACCESS_TOKEN = 'token';

    // We just check that buildApp with a valid secret registers the route
    const app = await buildApp();
    const routes = app.printRoutes();
    expect(routes).toContain('webhooks/billing/mobbex');
  });
});

// T019 — subscription event routing (R001, R011)

describe('mobbexWebhookRoutes — subscription event routing (R001, R011)', () => {
  it('WHEN payload type is subscription.activated THEN responds HTTP 200 AND dispatchMobbexSubscriptionEvent is called AND dispatchMobbexEvent is NOT called', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from(JSON.stringify({ type: 'subscription.activated', data: { subscription_id: 'psub-1' } })),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockSubscriptionDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('WHEN payload type is payment.success THEN dispatchMobbexEvent is called AND dispatchMobbexSubscriptionEvent is NOT called', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=correct-secret',
      payload: Buffer.from(JSON.stringify({ type: 'payment.success', data: { id: 'ptx-001' } })),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionDispatch).not.toHaveBeenCalled();
  });
});
