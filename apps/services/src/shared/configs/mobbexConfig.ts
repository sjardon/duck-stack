const env = process.env || {};

export const mobbexConfig = {
  billingProvider: env.BILLING_PROVIDER ?? 'mobbex',
  apiKey: env.MOBBEX_API_KEY ?? '',
  accessToken: env.MOBBEX_ACCESS_TOKEN ?? '',
  testMode: env.MOBBEX_TEST_MODE === 'true' || env.MOBBEX_TEST_MODE === '1',
  timeoutMs: parseInt(env.MOBBEX_TIMEOUT_MS ?? '10000', 10),
  webhookSecret: env.MOBBEX_WEBHOOK_SECRET ?? '',
};
