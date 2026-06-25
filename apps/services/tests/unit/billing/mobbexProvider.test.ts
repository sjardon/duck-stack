// Mock the static logger so we can spy on its methods
jest.mock('../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { MobbexProvider } from '../../../src/modules/billing/providers/mobbexProvider.js';
import { ProviderError } from '../../../src/shared/errors.js';
import { logger } from '../../../src/shared/infrastructure/logger.js';
import type { CheckoutInput } from '@repo/types';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

const baseConfig = {
  apiKey: 'test-api-key',
  accessToken: 'test-access-token',
  testMode: false,
  timeoutMs: 5000,
  webhookSecret: 'test-secret',
};

const checkoutInput: CheckoutInput = {
  reference: 'order-123',
  total: { amount: 1000, currency: 'ARS' },
  description: 'Test payment',
  callbackUrl: 'https://example.com/callback',
  webhookUrl: 'https://example.com/webhook',
};

function makeFetchMock(response: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  return jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: response.json,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MobbexProvider — auth headers (R003, R004)', () => {
  it('sends X-API-Key and X-Access-Token headers on createCheckout', async () => {
    const fetchMock = makeFetchMock({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: 'session-abc',
            url: 'https://mobbex.com/pay/session-abc',
            expiration: new Date(Date.now() + 3600000).toISOString(),
          },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);
    await provider.createCheckout(checkoutInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('test-api-key');
    expect(headers['X-Access-Token']).toBe('test-access-token');
  });
});

describe('MobbexProvider — test mode (R005)', () => {
  it('includes test mode indicator in request body when testMode is true', async () => {
    const fetchMock = makeFetchMock({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: 'session-test',
            url: 'https://mobbex.com/pay/session-test',
            expiration: new Date(Date.now() + 3600000).toISOString(),
          },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider({ ...baseConfig, testMode: true });
    await provider.createCheckout(checkoutInput);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['test']).toBe(true);
  });
});

describe('MobbexProvider — createCheckout happy path (R003)', () => {
  it('returns CheckoutSession with sessionId, checkoutUrl, and expiresAt when Mobbex responds 200', async () => {
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    const fetchMock = makeFetchMock({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: 'session-xyz',
            url: 'https://mobbex.com/pay/session-xyz',
            expiration: expiresAt,
          },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);
    const session = await provider.createCheckout(checkoutInput);

    expect(session.sessionId).toBe('session-xyz');
    expect(session.checkoutUrl).toBe('https://mobbex.com/pay/session-xyz');
    expect(session.expiresAt).toBeInstanceOf(Date);
  });
});

describe('MobbexProvider — queryTransaction happy path (R003)', () => {
  it('returns TransactionStatus with correct status mapping when Mobbex responds 200', async () => {
    const fetchMock = makeFetchMock({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: 'txn-001',
            reference: 'order-123',
            status: 'approved',
            total: 1000,
            currency: 'ARS',
          },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);
    const txn = await provider.queryTransaction('txn-001');

    expect(txn.transactionId).toBe('txn-001');
    expect(txn.reference).toBe('order-123');
    expect(txn.status).toBe('approved');
    expect(txn.total.amount).toBe(1000);
    expect(txn.total.currency).toBe('ARS');
  });
});

describe('MobbexProvider — createSubscription and cancelSubscription (R003)', () => {
  it('returns subscriptionId when Mobbex responds 200 on createSubscription', async () => {
    const fetchMock = makeFetchMock({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: { id: 'sub-001' },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);
    const result = await provider.createSubscription('plan-basic', 'user-ref-1');

    expect(result.subscriptionId).toBe('sub-001');
  });

  it('resolves without error when Mobbex responds 200 on cancelSubscription', async () => {
    const fetchMock = makeFetchMock({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: {} }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);
    await expect(provider.cancelSubscription('sub-001')).resolves.toBeUndefined();
  });
});

describe('MobbexProvider — verifyWebhook (R008, EC003)', () => {
  it('returns WebhookEvent with type and data when secret matches', async () => {
    const provider = new MobbexProvider(baseConfig);
    const rawBody = Buffer.from(
      JSON.stringify({ type: 'payment.approved', data: { id: 'txn-001' } }),
    );
    const headers: Record<string, string> = {
      'x-mobbex-signature': 'test-secret',
    };

    const event = await provider.verifyWebhook(rawBody, headers);

    expect(event.type).toBe('payment.approved');
    expect(event.data).toEqual({ id: 'txn-001' });
  });

  it('throws ProviderError with statusCode 400 when secret does not match', async () => {
    const provider = new MobbexProvider(baseConfig);
    const rawBody = Buffer.from(JSON.stringify({ type: 'payment.approved', data: {} }));
    const headers: Record<string, string> = {
      'x-mobbex-signature': 'wrong-secret',
    };

    await expect(provider.verifyWebhook(rawBody, headers)).rejects.toThrow(ProviderError);
    await expect(provider.verifyWebhook(rawBody, headers)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('MobbexProvider — timeout and network errors (NF003, EC001)', () => {
  it('throws ProviderError with statusCode 502 when fetch exceeds timeoutMs', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    const provider = new MobbexProvider({ ...baseConfig, timeoutMs: 1 });

    await expect(provider.createCheckout(checkoutInput)).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(provider.createCheckout(checkoutInput)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError with statusCode 502 when a network error occurs', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    await expect(provider.createCheckout(checkoutInput)).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(provider.createCheckout(checkoutInput)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('MobbexProvider — 4xx and 5xx error mapping (NF002, EC001, EC002)', () => {
  it('throws ProviderError with statusCode 400 when Mobbex returns 4xx', async () => {
    const fetchMock = makeFetchMock({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'Invalid reference format' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    await expect(provider.createCheckout(checkoutInput)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(provider.createCheckout(checkoutInput)).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError with statusCode 502 when Mobbex returns 5xx', async () => {
    const fetchMock = makeFetchMock({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Service unavailable' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    await expect(provider.createCheckout(checkoutInput)).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('throws ProviderError with statusCode 502 and upstream error code in message when Mobbex returns 401', async () => {
    const fetchMock = makeFetchMock({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'INVALID_API_KEY' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    const err = await provider.createCheckout(checkoutInput).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).statusCode).toBe(502);
    expect((err as ProviderError).message).toContain('INVALID_API_KEY');
  });
});

// T013 — originalError is set on ProviderError from fetchWithTimeout (R005, R006, R007, NF001, NF002, EC003)

describe('MobbexProvider.fetchWithTimeout — originalError set on network error (R005, R007, NF001, NF002)', () => {
  it('WHEN a network error occurs THEN logger.error is called and the thrown ProviderError has originalError set to the original Error', async () => {
    const networkError = new Error('ECONNREFUSED');
    global.fetch = jest.fn().mockRejectedValue(networkError) as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    let thrown: unknown;
    try {
      await provider.createCheckout(checkoutInput);
    } catch (e) {
      thrown = e;
    }

    expect(mockLogger.error).toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).originalError).toBe(networkError);
  });

  it('WHEN a timeout (AbortError) occurs THEN logger.error is called and the thrown ProviderError has originalError set to the AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    const provider = new MobbexProvider({ ...baseConfig, timeoutMs: 1 });

    let thrown: unknown;
    try {
      await provider.createCheckout(checkoutInput);
    } catch (e) {
      thrown = e;
    }

    expect(mockLogger.error).toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).originalError).toBe(abortError);
  });

  it('WHEN queryTransaction causes a network error THEN the thrown ProviderError has originalError set', async () => {
    const networkError = new Error('network failure');
    global.fetch = jest.fn().mockRejectedValue(networkError) as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    let thrown: unknown;
    try {
      await provider.queryTransaction('txn-001');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).originalError).toBe(networkError);
  });
});

// T015 — handleErrorResponse warn on JSON parse failure (R008, NF001, EC004)

describe('MobbexProvider.handleErrorResponse — warn on JSON parse failure (R008, NF001, EC004)', () => {
  it('WHEN Mobbex returns a non-OK response with an unparseable JSON body THEN logger.warn is called referencing the discarded body and the method still throws ProviderError', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    let thrown: unknown;
    try {
      await provider.createCheckout(checkoutInput);
    } catch (e) {
      thrown = e;
    }

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 422 }),
      expect.stringContaining('failed to parse error body'),
    );
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(400);
  });

  it('WHEN Mobbex returns a 401 response with an unparseable JSON body THEN logger.warn is called and ProviderError(502) is thrown', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new MobbexProvider(baseConfig);

    let thrown: unknown;
    try {
      await provider.createCheckout(checkoutInput);
    } catch (e) {
      thrown = e;
    }

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
  });
});
