# BILLING-004 — Refunds Reflection (Provider-Initiated)

## Reason for being

After BILLING-002 and BILLING-003 the system can persist checkout transactions and reflect their final approval or failure via the Mobbex webhook. However, an approved transaction may later need to be refunded (totally or partially) for support, dispute, or operational reasons. Refunds are not user-driven: an operator triggers them from the Mobbex portal (or, in the future, from an internal admin tool). Today the system has no representation of refunds, so the local `transactions` table can drift out of sync with the provider — a transaction that has been fully refunded in Mobbex still appears as `approved` locally, and there is no way to surface refund history to the owner of the transaction.

This feature introduces a local `refunds` table, extends the existing Mobbex webhook dispatcher to recognize refund events and persist them idempotently, transitions the parent transaction to `refunded` only when the cumulative approved refund amount equals the original transaction amount, and exposes a read-only authenticated endpoint that lists the refunds associated with a given transaction.

## Scope

The requirements cover a new Supabase `refunds` table, the addition of refund event types (`refund.success`, `refund.failure`, or Mobbex equivalents) to the dispatcher under `apps/services/src/modules/webhooks/mobbex/`, idempotent upserts keyed by `provider_refund_id`, an atomic transition of the parent transaction's `status` to `refunded` when the cumulative approved refund amount matches the original amount, a `getRefundsByTransactionId` repository method on the billing module, and a new authenticated read endpoint `GET /billing/transactions/:id/refunds`. The feature explicitly does **not** introduce any refund-trigger endpoint exposed to end users or to a public API.

## Out of scope

- Public/authenticated endpoint for end users to request or trigger refunds (refunds are not self-service).
- Admin-only endpoint for internal operators to trigger refunds from a dashboard (depends on an admin role model that does not yet exist).
- "Refund request" workflow with a `requested` state and human approval step.
- Automated handling of disputes or chargebacks.
- Scheduled refunds or refunds in installments.
- UI rendering of refund history in `apps/web` (read endpoint is provided but consumption is out of scope).
- Refund event handling for subscriptions (out of the billing one-off scope).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a Supabase `refunds` table with columns `id` (uuid PK), `transaction_id` (uuid FK -> `transactions.id`), `amount` (numeric), `reason` (text nullable), `status` (text constrained to `pending` \| `approved` \| `failed`), `provider_refund_id` (text unique), `created_at` (timestamptz), and `updated_at` (timestamptz). |
| R002 | Event-driven | WHEN a verified webhook event arrives at `POST /webhooks/billing/mobbex` whose `event_type` indicates a successful refund (e.g. `refund.success` or the Mobbex equivalent), the system shall locate the parent transaction by `provider_transaction_id` and upsert a row in `refunds` keyed by `provider_refund_id` with `status = 'approved'`, the event's `amount`, and the event's `reason` (when present). |
| R003 | Event-driven | WHEN a verified webhook event arrives at `POST /webhooks/billing/mobbex` whose `event_type` indicates a failed refund (e.g. `refund.failure` or the Mobbex equivalent), the system shall locate the parent transaction by `provider_transaction_id` and upsert a row in `refunds` keyed by `provider_refund_id` with `status = 'failed'`, the event's `amount`, and the event's `reason` (when present). |
| R004 | Conditional | IF after persisting an `approved` refund the sum of `amount` across all `refunds` rows in `status = 'approved'` for the parent transaction equals the parent transaction's `amount`, THEN the system shall update the parent transaction's `status` to `refunded`. |
| R005 | Conditional | IF after persisting an `approved` refund the sum of `amount` across all `refunds` rows in `status = 'approved'` for the parent transaction is strictly less than the parent transaction's `amount`, THEN the system shall leave the parent transaction's `status` unchanged. |
| R006 | Ubiquitous | The system shall perform the refund upsert and any resulting `transactions.status` update inside a single database transaction so no caller can observe a state in which the refund is persisted but the parent transaction status is stale (or vice versa). |
| R007 | Conditional | IF a verified refund webhook event references a `provider_transaction_id` that does not match any row in `transactions`, THEN the system shall not create a row in `refunds`, shall persist the event in `billing_webhook_events` with `transaction_id = NULL`, shall log a warning carrying the `provider_transaction_id` and `provider_refund_id`, and shall respond with HTTP 200. |
| R008 | Event-driven | WHEN a verified refund webhook event is received with the same `provider_refund_id` as an already-persisted refund, the system shall upsert the existing row (no duplicate insert) and shall respond with HTTP 200. |
| R009 | Ubiquitous | The system shall expose `GET /billing/transactions/:id/refunds` protected by the `requireAuth` preHandler, returning the list of refunds associated with the transaction ordered by `created_at` ascending. |
| R010 | Conditional | IF the transaction referenced by `GET /billing/transactions/:id/refunds` does not exist, THEN the system shall respond with HTTP 404 and the domain error code `NOT_FOUND`. |
| R011 | Conditional | IF the transaction referenced by `GET /billing/transactions/:id/refunds` exists but belongs to a different `user_id`/`org_id` than the authenticated requester, THEN the system shall respond with HTTP 403 and the domain error code `FORBIDDEN`. |
| R012 | Ubiquitous | The system shall not expose any HTTP endpoint (public or authenticated) that triggers a refund against the payment provider; refund creation flows exclusively from provider-initiated webhook events. |
| R013 | Ubiquitous | The system shall route all database access for refunds through a typed repository method `getRefundsByTransactionId(transactionId)` on the billing module's repository, and through the webhook module's `MobbexBillingSyncRepository` for the upsert + atomic transaction status update; no SQL shall live in handlers, use cases, dispatchers, or routes. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The refund upsert and the conditional `transactions.status` update shall execute atomically inside a single database transaction so a concurrent reader of either table never sees an inconsistent intermediate state. |
| NF002 | The webhook handler shall emit a structured log entry per processed refund event including at least `event_type`, `provider_transaction_id`, `provider_refund_id`, `amount`, and `outcome` (`approved` \| `failed` \| `unresolved` \| `noop`). |
| NF003 | Secrets, full request headers, and any PII present in the refund payload shall never be written to log output; only the fields listed in NF002 may be logged. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a refund webhook event arrives whose `provider_transaction_id` does not match any row in `transactions`, the system shall skip the `refunds` insert, persist the raw event in `billing_webhook_events` with `transaction_id = NULL`, log a warning carrying the `provider_transaction_id` and `provider_refund_id`, and respond with HTTP 200. |
| EC002 | WHEN the same refund webhook event is delivered more than once by Mobbex (network retry), the system shall upsert the `refunds` row by `provider_refund_id` so the second delivery produces no duplicate row, recompute the cumulative approved amount, leave `transactions.status` unchanged if it is already `refunded`, and respond with HTTP 200. |
| EC003 | WHEN multiple partial refund events are received in sequence and the cumulative approved amount equals the parent transaction's `amount` only on the final event, the system shall update `transactions.status` to `refunded` exclusively on that final event and leave it as `approved` for every preceding partial event. |
| EC004 | WHEN a refund event with `status = 'failed'` is received, the system shall persist the `refunds` row with `status = 'failed'`, shall exclude its `amount` from the cumulative approved-refund sum, and shall not modify `transactions.status`. |
| EC005 | WHEN a refund event is received for a parent transaction whose current `status` is `pending` (anomalous case — refund issued before the original payment was reflected locally), the system shall still persist the refund row, log a warning carrying `transaction_id`, `provider_refund_id`, and current `transactions.status`, and shall not modify `transactions.status` (manual reconciliation from the provider portal is required). |
| EC006 | WHEN a refund event arrives whose payload is missing the `amount` field or whose `amount` is not a positive numeric value, the system shall persist the raw event in `billing_webhook_events`, log a warning, skip the `refunds` upsert, and respond with HTTP 200 (the parent transaction remains untouched). |
| EC007 | WHEN `GET /billing/transactions/:id/refunds` is called for a transaction that exists and belongs to the requester but has no associated refunds, the system shall respond with HTTP 200 and a JSON body containing an empty array. |

## Technical constraints

- Backend changes extend two existing modules: the webhook dispatcher under `apps/services/src/modules/webhooks/mobbex/` recognizes the new refund event types, and the billing module repository (`apps/services/src/modules/billing/repositories/`) gains a typed `getRefundsByTransactionId` method.
- The webhook-side upsert and the conditional `transactions.status` update are implemented as a single atomic operation on `MobbexBillingSyncRepository` (e.g., `upsertRefundAndMaybeMarkTransactionRefunded`) executed inside a `postgres.js` `BEGIN`/`COMMIT` block, in line with NF001 and R006.
- A new Supabase migration under `apps/services/supabase/migrations/` creates the `refunds` table with `transaction_id REFERENCES transactions(id) ON DELETE CASCADE`, a `UNIQUE` constraint on `provider_refund_id`, a `CHECK` constraint enforcing `status IN ('pending', 'approved', 'failed')`, and an index on `transaction_id` for the read-side query.
- A new shared type `Refund` is added to `@repo/types` mirroring the table columns (no runtime dependencies, plain TypeScript interface).
- The read endpoint follows the established feature module pattern (handler -> useCase -> IBillingRepository -> BillingDBRepository) introduced in BILLING-002. No SQL appears outside the repository implementation.
- Domain errors thrown by the read endpoint extend `DomainError` from `shared/errors.ts` (`NotFoundError`, `ForbiddenError`).
- The dispatcher in `mobbexEventHandlers.ts` is extended (not duplicated) — refund event classification reuses the same `dispatchMobbexEvent` entry point established by BILLING-003 so audit recording in `billing_webhook_events` continues to apply uniformly to refund events.

## Dependencies

- BILLING-002 — `transactions` table, `provider_transaction_id` column, `requireAuth`-protected read endpoints pattern, billing module repository.
- BILLING-003 — `POST /webhooks/billing/mobbex` endpoint, secret verification, `billing_webhook_events` audit table, `MobbexBillingSyncRepository`, dispatcher entry point.
- SERVICES-001 — base `apps/services` Fastify application.
- AUTH-001 — `requireAuth` preHandler.
