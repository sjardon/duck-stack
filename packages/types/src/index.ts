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
  createSubscription(planId: string, subscriberRef: string): Promise<{ subscriptionId: string; checkoutUrl: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent>;
}

export type TransactionStatusValue = 'pending' | 'approved' | 'failed' | 'refunded';

export interface Transaction {
  id: string;
  user_id: string | null;
  org_id: string | null;
  provider: string;
  provider_transaction_id: string | null;
  amount: number;
  currency: string;
  status: TransactionStatusValue;
  description: string;
  reference: string;
  idempotency_key: string | null;
  metadata: Record<string, unknown> | null;
  failure_reason: string | null;
  checkout_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCheckoutInput {
  amount: number;
  currency: string;
  description: string;
  items?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface TransactionListResponse {
  data: Transaction[];
  nextCursor: string | null;
}

export type RefundStatusValue = 'pending' | 'approved' | 'failed';

export interface Refund {
  id: string;
  transaction_id: string;
  amount: number;
  reason: string | null;
  status: RefundStatusValue;
  provider_refund_id: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatusValue =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'trialing';

export interface Subscription {
  id: string;
  user_id: string | null;
  org_id: string | null;
  plan_id: string;
  provider: string;
  provider_subscription_id: string | null;
  status: SubscriptionStatusValue;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_ends_at: string | null;
  days_remaining?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriptionInput {
  planCode: string;
}

export interface CancelSubscriptionInput {
  atPeriodEnd: boolean;
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

export type EntitlementName =
  | 'advanced_analytics'
  | 'priority_support'
  | 'api_access'
  | 'team_collaboration'
  | 'white_label';

export type QuotaName = string;

export interface QuotaThresholds {
  soft_limit: number;
  hard_limit: number;
}

export type QuotaState = 'normal' | 'soft_exceeded' | 'hard_exceeded';

export type QuotaMode = 'pre' | 'post';

export type QuotaUnit = string;

export interface QuotaStrategy {
  unit: QuotaUnit;
  mode: QuotaMode;
  compute: (req: unknown) => number;
}

export interface QuotaUsage {
  name: QuotaName;
  count: number;
  soft_limit: number;
  hard_limit: number;
  period_start: string;
  period_end: string;
  state: QuotaState;
  unit: string;
}

export interface QuotasResponse {
  quotas: QuotaUsage[];
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  is_active: boolean;
  provider_plan_id: string | null;
  created_at: string;
  updated_at: string;
}
