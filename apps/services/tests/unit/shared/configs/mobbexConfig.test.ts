describe('mobbexConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('WHEN MOBBEX_* vars are absent', () => {
    beforeEach(() => {
      delete process.env.BILLING_PROVIDER;
      delete process.env.MOBBEX_API_KEY;
      delete process.env.MOBBEX_ACCESS_TOKEN;
      delete process.env.MOBBEX_TEST_MODE;
      delete process.env.MOBBEX_TIMEOUT_MS;
      delete process.env.MOBBEX_WEBHOOK_SECRET;
    });

    it('exposes billingProvider default "mobbex"', async () => {
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.billingProvider).toBe('mobbex');
    });

    it('exposes apiKey default ""', async () => {
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.apiKey).toBe('');
    });

    it('exposes accessToken default ""', async () => {
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.accessToken).toBe('');
    });

    it('exposes testMode default false', async () => {
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.testMode).toBe(false);
    });

    it('exposes timeoutMs default 10000', async () => {
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.timeoutMs).toBe(10000);
    });

    it('exposes webhookSecret default ""', async () => {
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.webhookSecret).toBe('');
    });
  });

  describe('WHEN MOBBEX_TEST_MODE is "true"', () => {
    it('exposes testMode as true', async () => {
      process.env.MOBBEX_TEST_MODE = 'true';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.testMode).toBe(true);
    });
  });

  describe('WHEN MOBBEX_TEST_MODE is "1"', () => {
    it('exposes testMode as true', async () => {
      process.env.MOBBEX_TEST_MODE = '1';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.testMode).toBe(true);
    });
  });

  describe('WHEN MOBBEX_TEST_MODE is any other value', () => {
    it('exposes testMode as false for "false"', async () => {
      process.env.MOBBEX_TEST_MODE = 'false';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.testMode).toBe(false);
    });

    it('exposes testMode as false for "0"', async () => {
      process.env.MOBBEX_TEST_MODE = '0';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.testMode).toBe(false);
    });

    it('exposes testMode as false for "yes"', async () => {
      process.env.MOBBEX_TEST_MODE = 'yes';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.testMode).toBe(false);
    });
  });

  describe('WHEN env vars are set', () => {
    it('reflects BILLING_PROVIDER value', async () => {
      process.env.BILLING_PROVIDER = 'stripe';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.billingProvider).toBe('stripe');
    });

    it('reflects MOBBEX_API_KEY value', async () => {
      process.env.MOBBEX_API_KEY = 'my-api-key';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.apiKey).toBe('my-api-key');
    });

    it('reflects MOBBEX_ACCESS_TOKEN value', async () => {
      process.env.MOBBEX_ACCESS_TOKEN = 'my-access-token';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.accessToken).toBe('my-access-token');
    });

    it('reflects MOBBEX_TIMEOUT_MS value as number', async () => {
      process.env.MOBBEX_TIMEOUT_MS = '5000';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.timeoutMs).toBe(5000);
    });

    it('reflects MOBBEX_WEBHOOK_SECRET value', async () => {
      process.env.MOBBEX_WEBHOOK_SECRET = 'webhook-secret';
      const { mobbexConfig } = await import('../../../../src/shared/configs/mobbexConfig.js');
      expect(mobbexConfig.webhookSecret).toBe('webhook-secret');
    });
  });
});
