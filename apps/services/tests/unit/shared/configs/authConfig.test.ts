describe('authConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('clerkJwtKey', () => {
    it('is undefined WHEN CLERK_JWT_KEY is absent', async () => {
      delete process.env.CLERK_JWT_KEY;
      const { authConfig } = await import('../../../../src/shared/configs/authConfig.js');
      expect(authConfig.clerkJwtKey).toBeUndefined();
    });

    it('reflects the value WHEN CLERK_JWT_KEY is set', async () => {
      process.env.CLERK_JWT_KEY = 'test-jwt-key';
      const { authConfig } = await import('../../../../src/shared/configs/authConfig.js');
      expect(authConfig.clerkJwtKey).toBe('test-jwt-key');
    });
  });

  describe('clerkWebhookSigningSecret', () => {
    it('is undefined WHEN CLERK_WEBHOOK_SIGNING_SECRET is absent', async () => {
      delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
      const { authConfig } = await import('../../../../src/shared/configs/authConfig.js');
      expect(authConfig.clerkWebhookSigningSecret).toBeUndefined();
    });

    it('reflects the value WHEN CLERK_WEBHOOK_SIGNING_SECRET is set', async () => {
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_test123';
      const { authConfig } = await import('../../../../src/shared/configs/authConfig.js');
      expect(authConfig.clerkWebhookSigningSecret).toBe('whsec_test123');
    });
  });
});
