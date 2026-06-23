import type {
  PaymentProvider,
  CheckoutInput,
  CheckoutSession,
  TransactionStatus,
  WebhookEvent,
} from '@repo/types';
import { ProviderError } from '../../../shared/errors.js';

export interface MobbexConfig {
  apiKey: string;
  accessToken: string;
  testMode: boolean;
  timeoutMs: number;
  webhookSecret: string;
}

const MOBBEX_BASE_URL = 'https://api.mobbex.com';

export class MobbexProvider implements PaymentProvider {
  private readonly config: MobbexConfig;

  constructor(config: MobbexConfig) {
    this.config = config;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const body: Record<string, unknown> = {
      reference: input.reference,
      currency: input.total.currency,
      description: input.description,
      total: input.total.amount / 100,
      callback_url: input.callbackUrl,
      webhook: input.webhookUrl,
    };

    if (this.config.testMode) {
      body['test'] = true;
    }

    const response = await this.fetchWithTimeout(`${MOBBEX_BASE_URL}/2.0/checkout`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { data: { id: string; url: string; expiration: string } };
    return {
      sessionId: payload.data.id,
      checkoutUrl: payload.data.url,
      expiresAt: new Date(payload.data.expiration),
    };
  }

  async queryTransaction(transactionId: string): Promise<TransactionStatus> {
    const response = await this.fetchWithTimeout(
      `${MOBBEX_BASE_URL}/2.0/operations/${transactionId}`,
      { method: 'GET' },
    );

    const payload = (await response.json()) as {
      data: {
        id: string;
        reference: string;
        status: string;
        total: number;
        currency: string;
      };
    };

    return {
      transactionId: payload.data.id,
      reference: payload.data.reference,
      status: this.mapStatus(payload.data.status),
      total: {
        amount: payload.data.total,
        currency: payload.data.currency,
      },
      providerData: payload.data as unknown as Record<string, unknown>,
    };
  }

  async createSubscription(
    planId: string,
    subscriberRef: string,
  ): Promise<{ subscriptionId: string }> {
    const response = await this.fetchWithTimeout(`${MOBBEX_BASE_URL}/2.0/subscriptions`, {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId, reference: subscriberRef }),
    });

    const payload = (await response.json()) as { data: { id: string } };
    return { subscriptionId: payload.data.id };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.fetchWithTimeout(
      `${MOBBEX_BASE_URL}/2.0/subscriptions/${subscriptionId}/cancel`,
      { method: 'POST' },
    );
  }

  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent> {
    const incomingSecret = this.extractSecret(headers);

    if (incomingSecret !== this.config.webhookSecret) {
      throw new ProviderError('Invalid webhook secret', 400);
    }

    const payload = JSON.parse(rawBody.toString('utf-8')) as {
      type: string;
      data: Record<string, unknown>;
    };

    return {
      type: payload.type,
      data: payload.data,
    };
  }

  /**
   * Extracts the shared secret from the x-mobbex-signature header.
   * Mobbex does not provide a cryptographic signature — callers pass a shared
   * secret via this header or embedded in the webhookUrl query string.
   */
  private extractSecret(headers: Record<string, string | string[] | undefined>): string {
    const sig = headers['x-mobbex-signature'];
    if (typeof sig === 'string') {
      return sig;
    }
    if (Array.isArray(sig)) {
      return sig[0] ?? '';
    }
    return '';
  }

  private mapStatus(
    providerStatus: string,
  ): TransactionStatus['status'] {
    const map: Record<string, TransactionStatus['status']> = {
      approved: 'approved',
      pending: 'pending',
      rejected: 'rejected',
      cancelled: 'cancelled',
      refunded: 'refunded',
    };
    return map[providerStatus] ?? 'pending';
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
          'X-Access-Token': this.config.accessToken,
          ...(init.headers as Record<string, string> | undefined),
        },
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return response;
    } catch (err: unknown) {
      if (err instanceof ProviderError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderError(`Request to Mobbex timed out after ${this.config.timeoutMs}ms`, 502);
      }
      const message = err instanceof Error ? err.message : 'Unknown network error';
      throw new ProviderError(`Network error calling Mobbex: ${message}`, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorCode: string | undefined;
    try {
      const body = (await response.json()) as { error?: string };
      errorCode = body.error;
    } catch {
      // ignore JSON parse failure
    }

    const message = errorCode ?? `Mobbex responded with HTTP ${response.status}`;

    // 401 (invalid credentials) and 5xx (server errors) map to 502
    if (response.status === 401 || response.status >= 500) {
      throw new ProviderError(message, 502);
    }

    // other 4xx map to 400 (provider-reported validation error)
    throw new ProviderError(message, 400);
  }
}
