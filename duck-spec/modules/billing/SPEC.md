# billing — Module Specification

Living functional specification of the billing module. Describes current behavior, not planned behavior.

---

## Payment provider abstraction (BILLING-001)

The billing module exposes a `PaymentProvider` port (interface) defined in `@repo/types`. All business logic interacts with the port only, never with a concrete vendor directly.

The active provider is resolved at boot time by `resolveProvider()` in `apps/services/src/modules/billing/providers/resolveProvider.ts`. It reads `BILLING_PROVIDER` from the environment (default `mobbex`) and returns a cached singleton. If the provider name is unknown or required credentials are absent, the function throws immediately so the HTTP server never starts.

### Supported operations

The `PaymentProvider` port declares five operations:

| Operation | Description |
|-----------|-------------|
| `createCheckout` | Creates a one-off checkout session and returns a redirect URL |
| `queryTransaction` | Returns a canonicalized `TransactionStatus` for a provider transaction ID |
| `createSubscription` | Creates a recurring subscription for a plan/subscriber pair |
| `cancelSubscription` | Cancels an active subscription |
| `verifyWebhook` | Authenticates an incoming webhook and returns a canonicalized `WebhookEvent` |

### MobbexProvider adapter

The only currently implemented adapter is `MobbexProvider` (`apps/services/src/modules/billing/providers/MobbexProvider.ts`), targeting the Mobbex HTTP API (Argentina/LATAM market).

Credentials are read exclusively from server-side environment variables (`MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_WEBHOOK_SECRET`) and are never exposed to frontend packages.

Every outbound request sets `X-API-Key` and `X-Access-Token` headers. Requests are wrapped with `AbortController` enforcing a configurable timeout (default 10 seconds). HTTP errors are mapped to `ProviderError`: `statusCode 502` for transient/upstream failures (5xx, 401, network errors, timeouts) and `statusCode 400` for provider-reported validation errors (other 4xx).

If `MOBBEX_TEST_MODE` is set to a truthy value the adapter operates in sandbox mode, setting `test: true` on checkout requests.

#### Webhook signature — known security trade-off (EC003)

Mobbex does not provide a native cryptographic signature (e.g., HMAC-SHA256) for webhook payloads. As a consequence, `verifyWebhook` cannot perform a cryptographic verification of the request body.

Instead, authenticity is verified by comparing a shared secret supplied by Mobbex via the `x-mobbex-signature` header (or embedded as a `?secret=...` query string in the webhook URL) against the value of `MOBBEX_WEBHOOK_SECRET` configured in the environment. If the values do not match, `verifyWebhook` throws `ProviderError('Invalid webhook secret', 400)`.

This is a known limitation imposed by the Mobbex platform. Callers should ensure `MOBBEX_WEBHOOK_SECRET` is a long, randomly generated value and that the webhook endpoint is served exclusively over HTTPS.

---

## Checkout and transaction records (BILLING-002)

The `transactions` Supabase table persists every checkout attempt. Columns: `id` (uuid PK, also used as the provider `reference`), `user_id`, `org_id`, `provider`, `provider_transaction_id`, `amount`, `currency`, `status` (`pending` | `approved` | `failed` | `refunded`), `description`, `reference` (unique), `checkout_url`, `metadata`, `failure_reason`, `created_at`, `updated_at`.

Three authenticated endpoints handle checkout and transaction query:

| Endpoint | Auth | Behavior |
|----------|------|----------|
| `POST /billing/checkout` | `requireAuth` | Creates a `pending` transaction row before calling the provider; returns `{ checkoutUrl, transactionId }`. If the provider call fails, the transaction remains `pending` with `failure_reason` set. |
| `GET /billing/transactions/:id` | `requireAuth` | Returns the transaction record for the owning user or org; 404 if not found; 403 if scope mismatch. |
| `GET /billing/transactions` | `requireAuth` | Returns a cursor-paginated list ordered by `created_at DESC`; accepts `limit` (default 20, max 100) and `cursor`. |

The local transaction `id` is sent to the provider as `reference`, making it the end-to-end idempotency key. An optional `Idempotency-Key` request header on `POST /billing/checkout` allows safe client retries — if a matching transaction already exists for the same requester, the existing record is returned without a new provider call. Input is validated with Zod (`amount > 0`, `currency` in `['ARS', 'USD']`, `description` non-empty). When the JWT carries `orgId` the transaction is associated with both `user_id` and `org_id`.

Shared types `Transaction`, `TransactionStatusValue`, `CreateCheckoutInput`, and `TransactionListResponse` are exported from `@repo/types`. A frontend API client in `apps/web/src/api/billing.ts` exposes `createCheckout`, `getTransaction`, and `listTransactions`.

---

## Payment webhooks (BILLING-003)

The system exposes `POST /webhooks/billing/mobbex` as a Fastify plugin registered in `app.ts` before `clerkAuthPlugin`, so the route is not subject to JWT verification.

### Secret verification

The plugin reads `MOBBEX_WEBHOOK_SECRET` via `mobbexConfig.webhookSecret` (from `src/shared/configs/mobbexConfig.ts`) at registration time and throws immediately if the variable is absent, preventing the server from starting. Incoming requests must supply the secret as the `?secret=` query parameter; requests with a missing or mismatched secret are rejected with HTTP 401 (`UNAUTHORIZED`). Payloads that cannot be parsed as JSON receive HTTP 400 (`VALIDATION_ERROR`).

### Audit table

Every verified event is recorded in the `billing_webhook_events` Supabase table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Auto-generated |
| `provider` | text | Always `'mobbex'` for this handler |
| `event_type` | text | As received from the payload |
| `payload` | jsonb | Full raw payload |
| `received_at` | timestamptz | Server-side `now()` |
| `transaction_id` | uuid nullable FK → `transactions.id` | `NULL` when the matching transaction cannot be resolved |
| `subscription_id` | uuid nullable | Reserved; unconstrained until the subscriptions table exists |

The foreign key uses `ON DELETE SET NULL` so deleting a transaction row does not purge its event history.

### Event dispatch

`dispatchMobbexEvent` in `src/modules/webhooks/mobbex/mobbexEventHandlers.ts` classifies incoming event types:

| Mobbex event types | Resulting status | `failure_reason` |
|--------------------|-----------------|-----------------|
| `payment.success`, `checkout.success` | `approved` | — |
| `payment.failure`, `checkout.failure`, `payment.rejected` | `failed` | Populated from event message |
| Any other type | No transaction update | Recorded in audit table only |

The dispatcher locates the matching local transaction by `provider_transaction_id` first, falling back to `reference`. All database calls go through `MobbexBillingSyncRepository` (in `src/modules/webhooks/repositories/mobbexBillingSyncRepository.ts`), which exposes `recordEvent` and `updateTransactionStatus`. The repository interface is declared in `src/modules/webhooks/repositories/interfaces/iMobbexBillingSyncRepository.ts`.

### Idempotency and edge cases

| Scenario | Outcome |
|----------|---------|
| Transaction not found by `provider_transaction_id` or `reference` | Event recorded with `transaction_id = NULL`; warning logged; HTTP 200 returned |
| Transaction already has the target status | No `UPDATE` issued on `transactions`; event still recorded; HTTP 200 returned |
| Same event delivered multiple times (network retry) | Each delivery creates a new row in `billing_webhook_events`; the idempotency check prevents duplicate status updates |
| Event arrives before local transaction row exists | Treated as unresolved; event recorded with `transaction_id = NULL`; HTTP 200 returned |
| Unknown event type (not a checkout payment event) | Recorded for audit; `transactions` not touched; HTTP 200 returned |

### Structured logging

The handler emits one structured log entry per processed event containing `event_type`, `provider_transaction_id`, and `outcome` (`approved` | `failed` | `noop` | `unresolved`). Secrets, full headers, and payload PII are never logged. For refund events the log entry also includes `provider_refund_id` and `amount`.

---

## Refunds reflection (BILLING-004)

The `refunds` Supabase table persists every refund event reported by the provider. Columns: `id` (uuid PK), `transaction_id` (uuid FK → `transactions.id` ON DELETE CASCADE), `amount` (numeric), `reason` (text nullable), `status` (text constrained to `pending` | `approved` | `failed`), `provider_refund_id` (text, UNIQUE), `created_at` (timestamptz), `updated_at` (timestamptz). An index on `transaction_id` supports efficient reads. An `updated_at` trigger keeps the column current on every row update.

### Webhook dispatch — refund events

`dispatchMobbexEvent` recognizes two additional event type sets: `refund.success` (maps to `refundStatus = 'approved'`) and `refund.failure` (maps to `refundStatus = 'failed'`). Both paths share the same dispatcher entry point established by BILLING-003, so every refund event is also recorded in `billing_webhook_events` under the same audit path as checkout events.

Before calling the repository, the dispatcher validates that the payload carries a non-empty `provider_refund_id` and a positive numeric `amount`. When either field is missing or invalid the event is recorded in `billing_webhook_events` with `transaction_id = NULL`, a warning is logged, and the endpoint returns HTTP 200 without creating a `refunds` row.

### Atomic refund upsert and transaction status transition

`MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded` executes all writes inside a single `sql.begin` block:

1. Resolves the parent transaction by `provider_transaction_id`. If not found, returns `{ outcome: 'unresolved', transactionId: null }` without inserting a refund row; the dispatcher records the event with `transaction_id = NULL`.
2. If the parent transaction has `status = 'pending'` (anomalous case), logs a warning carrying `transaction_id`, `provider_refund_id`, and current status, then continues to persist the refund row without modifying `transactions.status`.
3. Upserts the `refunds` row by `provider_refund_id` (`ON CONFLICT (provider_refund_id) DO UPDATE`), ensuring idempotent re-delivery produces no duplicate row.
4. For `refundStatus = 'approved'`: sums `amount` across all `status = 'approved'` rows for the parent transaction. If the total equals `transactions.amount` and the transaction is not already `refunded`, updates `transactions.status = 'refunded'` within the same block and returns `{ outcome: 'transaction_refunded', transactionId }`. Otherwise returns `{ outcome: 'refund_approved', transactionId }`.
5. For `refundStatus = 'failed'`: returns `{ outcome: 'refund_failed', transactionId }` without modifying `transactions.status`.

The outcome values (`refund_approved`, `refund_failed`, `transaction_refunded`, `unresolved`, `noop`) extend the existing set used by BILLING-003 checkout events and are included in the structured log entry.

### Idempotency and edge cases

| Scenario | Outcome |
|----------|---------|
| `provider_transaction_id` not found locally | No `refunds` row created; event recorded with `transaction_id = NULL`; warning logged; HTTP 200 |
| Same refund event delivered more than once | Upsert by `provider_refund_id` is a no-op on conflict; cumulative sum is recomputed; `transactions.status` unchanged if already `refunded`; HTTP 200 |
| Partial refunds accumulate to full amount only on the last event | `transactions.status` is set to `refunded` exclusively on the event where the cumulative approved total equals `transactions.amount` |
| `refund.failure` event received | Refund row persisted with `status = 'failed'`; its `amount` is excluded from the cumulative approved sum; `transactions.status` unchanged |
| Refund event for a `pending` transaction | Refund row persisted; warning logged; `transactions.status` not modified |
| Payload missing `amount` or `provider_refund_id` | Event recorded in audit table; `refunds` row skipped; warning logged; HTTP 200 |

### Read endpoint

`GET /billing/transactions/:id/refunds` is registered in `billingRoutes` with `preHandler: requireAuth`. The `GetRefundsUseCase` verifies that the transaction exists (404 if not, using `NotFoundError`) and that it belongs to the authenticated requester — same ownership check as `GetTransactionUseCase` (403 if scope mismatch, using `ForbiddenError`). It then returns the list of refunds ordered by `created_at ASC` via `ITransactionRepository.getRefundsByTransactionId`. When no refunds exist the endpoint returns HTTP 200 with an empty array.

All SQL for refund reads lives in `TransactionDBRepository.getRefundsByTransactionId`. All SQL for refund writes and the atomic transaction status transition lives in `MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded`. No SQL appears in handlers, use cases, dispatchers, or routes.

### Shared types

`@repo/types` exports `RefundStatusValue` (`'pending' | 'approved' | 'failed'`) and `Refund` (plain TypeScript interface mirroring the `refunds` table columns). A local `RefundEntity` interface in `apps/services/src/modules/billing/entities/refund.entity.ts` mirrors the same shape for internal use.
