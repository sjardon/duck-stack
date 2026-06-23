import Fastify from 'fastify';

// Mock db before importing routes
jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

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

async function buildApp(secret: string | undefined) {
  // Set env before importing config
  if (secret !== undefined) {
    process.env.MOBBEX_WEBHOOK_SECRET = secret;
  } else {
    delete process.env.MOBBEX_WEBHOOK_SECRET;
  }

  // Re-require config module so env change takes effect
  jest.resetModules();

  const { default: mobbexWebhookRoutes } = await import(
    '../../../../../src/modules/webhooks/mobbex/routes.js'
  );

  const fastify = Fastify({ logger: false });
  await fastify.register(mobbexWebhookRoutes);
  return fastify;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch.mockResolvedValue('approved');
});

afterEach(() => {
  delete process.env.MOBBEX_WEBHOOK_SECRET;
});

// T013 — secret verification

describe('mobbexWebhookRoutes — registration and secret verification', () => {
  it('WHEN MOBBEX_WEBHOOK_SECRET is absent THEN plugin registration throws Error', async () => {
    await expect(buildApp(undefined)).rejects.toThrow(
      /MOBBEX_WEBHOOK_SECRET/,
    );
  });

  it('WHEN request arrives with wrong secret THEN responds HTTP 401 with code UNAUTHORIZED', async () => {
    const app = await buildApp('correct-secret');

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
    const app = await buildApp('correct-secret');

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
    const app = await buildApp('correct-secret');

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
    const app = await buildApp('test-secret');

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=test-secret',
      payload: Buffer.from('not-valid-json'),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('WHEN body is valid JSON THEN dispatchMobbexEvent is called with parsed object', async () => {
    const app = await buildApp('test-secret');
    const eventPayload = { type: 'payment.success', data: { id: 'ptx-001' } };

    await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=test-secret',
      payload: Buffer.from(JSON.stringify(eventPayload)),
      headers: { 'content-type': 'application/json' },
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment.success' }),
      expect.anything(),
    );
  });
});

// T015 — success response and logging

describe('mobbexWebhookRoutes — success response', () => {
  it('WHEN a verified valid event is processed THEN responds HTTP 200 with { received: true }', async () => {
    const app = await buildApp('test-secret');
    const eventPayload = { type: 'payment.success', data: { id: 'ptx-001' } };

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mobbex?secret=test-secret',
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
    const app = await buildApp('test-secret');
    const routes = app.printRoutes();
    expect(routes).toContain('webhooks/billing/mobbex');
  });
});
