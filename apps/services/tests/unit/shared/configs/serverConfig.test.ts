describe('serverConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('WHEN env vars are absent', () => {
    it('exposes nodeEnv default "development"', async () => {
      delete process.env.NODE_ENV;
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.nodeEnv).toBe('development');
    });

    it('exposes logLevel default "info"', async () => {
      delete process.env.LOG_LEVEL;
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.logLevel).toBe('info');
    });

    it('exposes host default "0.0.0.0"', async () => {
      delete process.env.HOST;
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.host).toBe('0.0.0.0');
    });

    it('exposes port default 3000', async () => {
      delete process.env.PORT;
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.port).toBe(3000);
    });

    it('exposes corsOrigin default "*"', async () => {
      delete process.env.CORS_ORIGIN;
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.corsOrigin).toBe('*');
    });
  });

  describe('WHEN env vars are set', () => {
    it('reflects NODE_ENV value', async () => {
      process.env.NODE_ENV = 'production';
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.nodeEnv).toBe('production');
    });

    it('reflects LOG_LEVEL value', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.logLevel).toBe('debug');
    });

    it('reflects HOST value', async () => {
      process.env.HOST = '127.0.0.1';
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.host).toBe('127.0.0.1');
    });

    it('reflects PORT value as number', async () => {
      process.env.PORT = '8080';
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.port).toBe(8080);
    });

    it('reflects CORS_ORIGIN value', async () => {
      process.env.CORS_ORIGIN = 'https://example.com';
      const { serverConfig } = await import('../../../../src/shared/configs/serverConfig.js');
      expect(serverConfig.corsOrigin).toBe('https://example.com');
    });
  });
});
