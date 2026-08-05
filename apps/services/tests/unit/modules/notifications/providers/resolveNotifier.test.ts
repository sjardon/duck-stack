/**
 * resolveNotifier uses a module-level singleton. Because Jest caches modules
 * between tests we use jest.resetModules() + dynamic import inside each test
 * to get a fresh module state with the desired process.env.
 */

const validEnv = {
  SES_REGION: 'us-east-1',
  EMAIL_SENDER_ADDRESS: 'noreply@example.com',
};

async function importResolveNotifier() {
  const mod = await import('../../../../../src/modules/notifications/providers/resolveNotifier.js');
  return mod.resolveNotifier;
}

function setEnv(overrides: Partial<typeof validEnv> & Record<string, string | undefined>) {
  Object.assign(process.env, validEnv);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEmailEnv() {
  delete process.env['SES_REGION'];
  delete process.env['EMAIL_SENDER_ADDRESS'];
}

beforeEach(() => {
  jest.resetModules();
  clearEmailEnv();
});

afterEach(() => {
  clearEmailEnv();
});

// T016 — R003
describe('resolveNotifier — cached singleton (R003)', () => {
  it('WHEN resolveNotifier() is called twice THEN both calls return the same SesEmailNotifier instance, constructed from emailConfig sesRegion/senderEmail', async () => {
    setEnv({});
    const resolveNotifier = await importResolveNotifier();

    const first = resolveNotifier();
    const second = resolveNotifier();

    expect(first).toBe(second);
    expect(typeof first.send).toBe('function');
  });

  it('throws a descriptive Error when EMAIL_SENDER_ADDRESS is missing (fail-fast)', async () => {
    setEnv({ EMAIL_SENDER_ADDRESS: undefined });
    const resolveNotifier = await importResolveNotifier();

    expect(() => resolveNotifier()).toThrow(Error);
    expect(() => resolveNotifier()).toThrow(/EMAIL_SENDER_ADDRESS/);
  });
});
