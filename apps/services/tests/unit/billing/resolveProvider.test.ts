/**
 * resolveProvider uses a module-level singleton. Because Jest caches modules
 * between tests we use jest.resetModules() + dynamic import inside each test
 * to get a fresh module state with the desired process.env.
 */

const validEnv = {
  BILLING_PROVIDER: 'mobbex',
  MOBBEX_API_KEY: 'key-abc',
  MOBBEX_ACCESS_TOKEN: 'token-xyz',
  MOBBEX_TEST_MODE: '',
  MOBBEX_WEBHOOK_SECRET: 'secret-123',
};

async function importResolveProvider() {
  const mod = await import('../../../src/modules/billing/providers/resolveProvider.js');
  return mod.resolveProvider;
}

function setEnv(overrides: Partial<typeof validEnv> & Record<string, string | undefined>) {
  // Apply base valid env first
  Object.assign(process.env, validEnv);
  // Apply overrides: delete keys explicitly set to undefined, assign others
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearBillingEnv() {
  delete process.env['BILLING_PROVIDER'];
  delete process.env['MOBBEX_API_KEY'];
  delete process.env['MOBBEX_ACCESS_TOKEN'];
  delete process.env['MOBBEX_TEST_MODE'];
  delete process.env['MOBBEX_WEBHOOK_SECRET'];
}

beforeEach(() => {
  jest.resetModules();
  clearBillingEnv();
});

afterEach(() => {
  clearBillingEnv();
});

describe('resolveProvider — default and mobbex (R002)', () => {
  it('returns an object satisfying the PaymentProvider interface when BILLING_PROVIDER is unset and credentials are present', async () => {
    setEnv({ BILLING_PROVIDER: undefined });
    const resolveProvider = await importResolveProvider();

    const provider = resolveProvider();

    expect(typeof provider.createCheckout).toBe('function');
    expect(typeof provider.queryTransaction).toBe('function');
    expect(typeof provider.createSubscription).toBe('function');
    expect(typeof provider.cancelSubscription).toBe('function');
    expect(typeof provider.verifyWebhook).toBe('function');
  });

  it('returns a PaymentProvider when BILLING_PROVIDER is explicitly "mobbex" and credentials are present', async () => {
    setEnv({});
    const resolveProvider = await importResolveProvider();

    const provider = resolveProvider();

    expect(typeof provider.createCheckout).toBe('function');
  });
});

describe('resolveProvider — fail-fast on unknown provider (R006)', () => {
  it('throws Error containing the unknown provider name when BILLING_PROVIDER is unknown', async () => {
    setEnv({ BILLING_PROVIDER: 'stripe' });
    const resolveProvider = await importResolveProvider();

    expect(() => resolveProvider()).toThrow(/stripe/);
    expect(() => resolveProvider()).toThrow(Error);
  });
});

describe('resolveProvider — fail-fast on missing credentials (R007)', () => {
  it('throws a descriptive Error when MOBBEX_API_KEY is missing', async () => {
    setEnv({ MOBBEX_API_KEY: undefined });
    const resolveProvider = await importResolveProvider();

    expect(() => resolveProvider()).toThrow(Error);
    expect(() => resolveProvider()).toThrow(/MOBBEX_API_KEY/);
  });

  it('throws a descriptive Error when MOBBEX_ACCESS_TOKEN is missing', async () => {
    setEnv({ MOBBEX_ACCESS_TOKEN: undefined });
    const resolveProvider = await importResolveProvider();

    expect(() => resolveProvider()).toThrow(Error);
    expect(() => resolveProvider()).toThrow(/MOBBEX_ACCESS_TOKEN/);
  });

  it('throws a descriptive Error when MOBBEX_API_KEY is empty string', async () => {
    setEnv({ MOBBEX_API_KEY: '' });
    const resolveProvider = await importResolveProvider();

    expect(() => resolveProvider()).toThrow(Error);
  });
});

describe('resolveProvider — singleton caching (EC004)', () => {
  it('returns the same object reference on repeated calls', async () => {
    setEnv({});
    const resolveProvider = await importResolveProvider();

    const first = resolveProvider();
    const second = resolveProvider();

    expect(first).toBe(second);
  });
});
