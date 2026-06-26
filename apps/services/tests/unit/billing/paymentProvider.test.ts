/**
 * R001 — Acceptance test for the PaymentProvider port.
 *
 * The system shall expose a PaymentProvider port that declares operations to
 * create a one-off checkout session, query a transaction status, create a
 * recurring subscription, cancel a subscription, and verify an incoming webhook.
 */

import type { PaymentProvider } from '@repo/types';

describe('PaymentProvider port (R001)', () => {
  it('declares createCheckout as a required operation', () => {
    const op: keyof PaymentProvider = 'createCheckout';
    expect(op).toBe('createCheckout');
  });

  it('declares queryTransaction as a required operation', () => {
    const op: keyof PaymentProvider = 'queryTransaction';
    expect(op).toBe('queryTransaction');
  });

  it('declares createSubscription as a required operation', () => {
    const op: keyof PaymentProvider = 'createSubscription';
    expect(op).toBe('createSubscription');
  });

  it('declares cancelSubscription as a required operation', () => {
    const op: keyof PaymentProvider = 'cancelSubscription';
    expect(op).toBe('cancelSubscription');
  });

  it('declares verifyWebhook as a required operation', () => {
    const op: keyof PaymentProvider = 'verifyWebhook';
    expect(op).toBe('verifyWebhook');
  });

  it('exposes exactly five operations on the interface', () => {
    // A minimal no-op implementation that satisfies the full PaymentProvider
    // contract is used here to confirm that all five operations are present and
    // that no additional keys are required to satisfy the TypeScript compiler.
    const impl: PaymentProvider = {
      createCheckout: () => Promise.resolve({ sessionId: '', checkoutUrl: '', expiresAt: new Date() }),
      queryTransaction: () =>
        Promise.resolve({
          transactionId: '',
          reference: '',
          status: 'pending',
          total: { amount: 0, currency: 'ARS' },
        }),
      createSubscription: () => Promise.resolve({ subscriptionId: '', checkoutUrl: '' }),
      cancelSubscription: () => Promise.resolve(),
      verifyWebhook: () => Promise.resolve({ type: '', data: {} }),
    };

    const operations = Object.keys(impl);
    expect(operations).toHaveLength(5);
    expect(operations).toContain('createCheckout');
    expect(operations).toContain('queryTransaction');
    expect(operations).toContain('createSubscription');
    expect(operations).toContain('cancelSubscription');
    expect(operations).toContain('verifyWebhook');
  });
});
