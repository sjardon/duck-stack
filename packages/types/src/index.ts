export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

// Monetary value; amount is in the smallest currency unit (cents/centavos)
export interface Money {
  amount: number; // integer, smallest unit
  currency: string; // ISO 4217, e.g. "ARS", "USD"
}

// Input for creating a one-off checkout session
export interface CheckoutInput {
  reference: string; // caller-assigned idempotency key / order ID
  total: Money;
  description: string;
  callbackUrl: string; // where Mobbex redirects after payment
  webhookUrl: string; // where Mobbex posts payment events
}

// Result of a created checkout session
export interface CheckoutSession {
  sessionId: string; // provider-assigned session ID
  checkoutUrl: string; // URL to redirect the user to
  expiresAt: Date;
}

// Canonical transaction status returned by queryTransaction
export interface TransactionStatus {
  transactionId: string;
  reference: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  total: Money;
  providerData?: Record<string, unknown>; // raw provider payload for debugging
}

// Canonicalized webhook event returned by verifyWebhook
export interface WebhookEvent {
  type: string; // e.g. 'payment.approved', 'subscription.cancelled'
  data: Record<string, unknown>;
}

// The port — every payment operation goes through this interface
export interface PaymentProvider {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  queryTransaction(transactionId: string): Promise<TransactionStatus>;
  createSubscription(planId: string, subscriberRef: string): Promise<{ subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent>;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  job_role: string | null;
  company_size: string | null;
  primary_use_case: string | null;
  onboarding_completed: boolean;
}
