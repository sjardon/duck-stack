import type { PaymentProvider } from '@repo/types';
import { MobbexProvider } from './mobbexProvider.js';
import { mobbexConfig } from '../../../shared/configs/mobbexConfig.js';

// Singleton — set once at first call; runtime env changes are ignored (EC004)
let cachedProvider: PaymentProvider | undefined;

export function resolveProvider(): PaymentProvider {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  const providerName = mobbexConfig.billingProvider;

  if (providerName === 'mobbex') {
    cachedProvider = createMobbexProvider();
    return cachedProvider;
  }

  throw new Error(
    `Unknown BILLING_PROVIDER: "${providerName}". Supported: mobbex`,
  );
}

function createMobbexProvider(): MobbexProvider {
  const apiKey = mobbexConfig.apiKey;
  const accessToken = mobbexConfig.accessToken;

  if (!apiKey || !accessToken) {
    throw new Error(
      'Missing required env var: MOBBEX_API_KEY / MOBBEX_ACCESS_TOKEN',
    );
  }

  const testMode = mobbexConfig.testMode;
  const timeoutMs = mobbexConfig.timeoutMs;
  const webhookSecret = mobbexConfig.webhookSecret;

  return new MobbexProvider({
    apiKey,
    accessToken,
    testMode,
    timeoutMs,
    webhookSecret,
  });
}
