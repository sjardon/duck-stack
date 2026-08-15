describe('errorTrackingConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('WHEN ERROR_TRACKING_DSN is set', () => {
    beforeEach(() => {
      process.env.ERROR_TRACKING_DSN = 'https://examplePublicKey@o0.ingest.betterstack.com/0';
    });

    it('exposes enabled true', async () => {
      const { errorTrackingConfig } = await import('../../../../src/shared/configs/errorTrackingConfig.js');
      expect(errorTrackingConfig.enabled).toBe(true);
    });

    it('exposes dsn matching the env var', async () => {
      const { errorTrackingConfig } = await import('../../../../src/shared/configs/errorTrackingConfig.js');
      expect(errorTrackingConfig.dsn).toBe('https://examplePublicKey@o0.ingest.betterstack.com/0');
    });
  });

  describe('WHEN ERROR_TRACKING_DSN is unset', () => {
    beforeEach(() => {
      delete process.env.ERROR_TRACKING_DSN;
    });

    it('exposes enabled false', async () => {
      const { errorTrackingConfig } = await import('../../../../src/shared/configs/errorTrackingConfig.js');
      expect(errorTrackingConfig.enabled).toBe(false);
    });

    it('exposes dsn default ""', async () => {
      const { errorTrackingConfig } = await import('../../../../src/shared/configs/errorTrackingConfig.js');
      expect(errorTrackingConfig.dsn).toBe('');
    });
  });

  describe('WHEN SERVICE_VERSION and ERROR_TRACKING_SAMPLE_RATE are unset', () => {
    beforeEach(() => {
      delete process.env.SERVICE_VERSION;
      delete process.env.ERROR_TRACKING_SAMPLE_RATE;
    });

    it('exposes release default "unknown"', async () => {
      const { errorTrackingConfig } = await import('../../../../src/shared/configs/errorTrackingConfig.js');
      expect(errorTrackingConfig.release).toBe('unknown');
    });

    it('exposes sampleRate default 0.2', async () => {
      const { errorTrackingConfig } = await import('../../../../src/shared/configs/errorTrackingConfig.js');
      expect(errorTrackingConfig.sampleRate).toBe(0.2);
    });
  });
});
