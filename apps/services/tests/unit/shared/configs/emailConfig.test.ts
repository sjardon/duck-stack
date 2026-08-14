describe('emailConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('WHEN RESEND_API_KEY/EMAIL_SENDER_ADDRESS are absent', () => {
    beforeEach(() => {
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_SENDER_ADDRESS;
    });

    it('exposes resendApiKey default ""', async () => {
      const { emailConfig } = await import('../../../../src/shared/configs/emailConfig.js');
      expect(emailConfig.resendApiKey).toBe('');
    });

    it('exposes senderEmail default ""', async () => {
      const { emailConfig } = await import('../../../../src/shared/configs/emailConfig.js');
      expect(emailConfig.senderEmail).toBe('');
    });
  });

  describe('WHEN env vars are set', () => {
    it('reflects RESEND_API_KEY value', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      const { emailConfig } = await import('../../../../src/shared/configs/emailConfig.js');
      expect(emailConfig.resendApiKey).toBe('re_test_key');
    });

    it('reflects EMAIL_SENDER_ADDRESS value', async () => {
      process.env.EMAIL_SENDER_ADDRESS = 'noreply@example.com';
      const { emailConfig } = await import('../../../../src/shared/configs/emailConfig.js');
      expect(emailConfig.senderEmail).toBe('noreply@example.com');
    });
  });
});
