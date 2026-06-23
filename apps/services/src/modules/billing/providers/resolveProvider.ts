import type { PaymentProvider } from '@repo/types';
import { MobbexProvider } from './MobbexProvider.js';

// Singleton — set once at first call; runtime env changes are ignored (EC004)
let cachedProvider: PaymentProvider | undefined;

export function resolveProvider(): PaymentProvider {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  const providerName = process.env['BILLING_PROVIDER'] ?? 'mobbex';

  if (providerName === 'mobbex') {
    cachedProvider = createMobbexProvider();
    return cachedProvider;
  }

  throw new Error(
    `Unknown BILLING_PROVIDER: "${providerName}". Supported: mobbex`,
  );
}

function createMobbexProvider(): MobbexProvider {
  const apiKey = process.env['MOBBEX_API_KEY'] ?? '';
  const accessToken = process.env['MOBBEX_ACCESS_TOKEN'] ?? '';

  if (!apiKey || !accessToken) {
    throw new Error(
      'Missing required env var: MOBBEX_API_KEY / MOBBEX_ACCESS_TOKEN',
    );
  }

  const testMode =
    process.env['MOBBEX_TEST_MODE'] === 'true' ||
    process.env['MOBBEX_TEST_MODE'] === '1';

  const timeoutMs = parseInt(process.env['MOBBEX_TIMEOUT_MS'] ?? '10000', 10);

  const webhookSecret = process.env['MOBBEX_WEBHOOK_SECRET'] ?? '';

  return new MobbexProvider({
    apiKey,
    accessToken,
    testMode,
    timeoutMs,
    webhookSecret,
  });
}
