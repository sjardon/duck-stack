# BILLING-003 — Payment Webhooks

## Reason for being

After BILLING-002 the system persists checkout transactions in the local `transactions` table with an initial `status = 'pending'`. The payment provider (Mobbex) determines the final outcome asynchronously and notifies the result via a webhook callback. Today there is no endpoint that receives those callbacks, so transactions remain stuck in `pending` even after the user has paid or the payment has been rejected.

This feature exposes a secure webhook endpoint for Mobbex billing events, verifies authenticity via a shared secret, updates the local transaction status idempotently, and persists every raw event in an audit table (`billing_webhook_events`) for later inspection and to absorb race conditions where the webhook arrives before the local transaction exists.

## Scope

The requirements cover the addition of a new Supabase table `billing_webhook_events`, a new webhook module under `apps/services/src/modules/webhooks/mobbex/` registered as a Fastify plugin before `clerk-auth`, a scoped raw-buffer JSON parser, secret verification via the `?secret=...` query parameter against `MOBBEX_WEBHOOK_SECRET`, a dispatcher that maps Mobbex `payment.success` / `payment.failure` (and equivalents) to status updates on the `transactions` table, idempotent semantics by current state, structured logging, and fail-fast boot validation of the webhook secret. The endpoint must respond HTTP 200 for any event successfully recorded (including no-ops), 401 if the secret check fails, and 400 if the payload is unparsable.

## Out of scope

- Webhooks for subscriptions events (covered by SUBS-003, which will reuse this endpoint base and the same `billing_webhook_events` table).
- Refund event handling (covered by BILLING-004).
- Admin UI to manually retry or replay webhook events.
- Alerting or notifications triggered by repeated webhook failures.
- Replay of historical events from the audit table.
- IP whitelisting of the Mobbex source (documented as optional but not implemented here).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a Supabase `billing_webhook_events` table with columns `id` (uuid PK), `provider` (text), `event_type` (text), `payload` (jsonb), `received_at` (timestamptz), `transaction_id` (uuid nullable FK -> `transactions.id`), and `subscription_id` (uuid nullable FK reserved for future subscriptions support). |
| R002 | Ubiquitous | The system shall expose a `POST /webhooks/billing/mobbex` route as a Fastify plugin under `src/modules/webhooks/mobbex/` registered in `app.ts` before `clerkAuthPlugin` so it is not subject to JWT verification. |
| R003 | Event-driven | WHEN the `POST /webhooks/billing/mobbex` plugin is registered, the system shall add a scoped `addContentTypeParser('application/json', { parseAs: 'buffer' }, ...)` so that `request.body` arrives as a raw `Buffer` inside this plugin only. |
| R004 | Event-driven | WHEN a request arrives at `POST /webhooks/billing/mobbex`, the system shall extract the `secret` query parameter and compare it against the configured `MOBBEX_WEBHOOK_SECRET`. |
| R005 | Conditional | IF the `secret` query parameter is missing or does not match `MOBBEX_WEBHOOK_SECRET`, THEN the system shall respond with HTTP 401 and the domain error code `UNAUTHORIZED` and shall not parse the payload nor persist any event. |
| R006 | Conditional | IF the raw body of `POST /webhooks/billing/mobbex` cannot be parsed as JSON, THEN the system shall respond with HTTP 400 and the domain error code `VALIDATION_ERROR`. |
| R007 | Event-driven | WHEN a verified webhook event is received, the system shall insert one row into `billing_webhook_events` capturing `provider = 'mobbex'`, `event_type`, the full parsed `payload` as JSONB, `received_at = now()`, and (when resolvable) the matching local `transaction_id`. |
| R008 | Event-driven | WHEN the received event type indicates a successful checkout payment (e.g. `payment.success` or the Mobbex equivalent), the system shall locate the local transaction by `provider_transaction_id` first and fall back to `reference`, and shall update its `status` to `approved`. |
| R009 | Event-driven | WHEN the received event type indicates a failed checkout payment (e.g. `payment.failure` or the Mobbex equivalent), the system shall locate the local transaction by `provider_transaction_id` first and fall back to `reference`, and shall update its `status` to `failed` and populate `failure_reason` with the message provided by the event. |
| R010 | Conditional | IF the event references a `provider_transaction_id`/`reference` that does not match any existing row in `transactions`, THEN the system shall log a warning, persist the event in `billing_webhook_events` with `transaction_id = NULL`, and respond with HTTP 200. |
| R011 | Conditional | IF the target transaction's current `status` already equals the status the event would set, THEN the system shall treat the event as a no-op (no `UPDATE` issued on `transactions`) while still persisting the event in `billing_webhook_events` and responding with HTTP 200. |
| R012 | Event-driven | WHEN an event was processed successfully (including no-op and unresolved-transaction cases), the system shall respond with HTTP 200 and a JSON body `{ received: true }`. |
| R013 | Ubiquitous | The system shall route all database calls of this module through a `MobbexBillingSyncRepository` class exposing at minimum `updateTransactionStatus` and `recordEvent` methods, instantiated via constructor injection in the handler. |
| R014 | Event-driven | WHEN `app.ts` registers the Mobbex webhook plugin, the system shall read `MOBBEX_WEBHOOK_SECRET` from `process.env` at registration time and throw an `Error` if it is absent, preventing the server from starting. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The `POST /webhooks/billing/mobbex` handler shall return a response within 5 seconds for every request under normal operating conditions. |
| NF002 | The system shall emit a structured log entry per processed event including at least `event_type`, `provider_transaction_id`, and `outcome` (`approved`, `failed`, `noop`, `unresolved`). |
| NF003 | Secrets, full request headers, and any PII present in the payload shall never be written to log output; only the fields listed in NF002 may be logged. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a `payment.success` event arrives before the matching local transaction row exists (race against `POST /billing/checkout`), the system shall persist the raw event in `billing_webhook_events` with `transaction_id = NULL`, log a warning carrying the `provider_transaction_id`/`reference`, and respond with HTTP 200. |
| EC002 | WHEN the same webhook event is delivered more than once by Mobbex (network retry), the system shall record each delivery in `billing_webhook_events` but shall not re-issue an `UPDATE` against `transactions` whose current `status` already equals the target status, and shall respond with HTTP 200 in every retry. |
| EC003 | WHEN a request reaches `POST /webhooks/billing/mobbex` over a transport other than HTTPS in a production deployment, the system shall still verify the `secret` query parameter; the platform-level limitation that Mobbex provides no cryptographic signature is documented in `duck-spec/modules/billing/SPEC.md` so operators can compensate via TLS termination upstream. |
| EC004 | WHEN a request arrives at `POST /webhooks/billing/mobbex` with a JSON payload missing both `data.id` (provider transaction id) and the `reference` field, the system shall persist the event in `billing_webhook_events` with `transaction_id = NULL`, log a warning, and respond with HTTP 200. |
| EC005 | WHEN a request arrives at `POST /webhooks/billing/mobbex` with an `event_type` that is not handled by the dispatcher (neither success nor failure of a checkout payment), the system shall persist the event in `billing_webhook_events` for audit and respond with HTTP 200 without touching `transactions`. |

## Technical constraints

- Backend module lives under `apps/services/src/modules/webhooks/mobbex/` with files `routes.ts`, `mobbexEventHandlers.ts` (dispatcher) and reuses the webhook repositories directory.
- A new `MobbexBillingSyncRepository` is added under `apps/services/src/modules/webhooks/repositories/` exposing `updateTransactionStatus(target, status, failureReason?)` and `recordEvent({ eventType, payload, transactionId })`.
- The plugin must follow the established Clerk webhook pattern: scoped raw-buffer `addContentTypeParser`, fail-fast secret check at registration time, registration in `app.ts` strictly before `clerkAuthPlugin`.
- Secret verification uses the `?secret=...` query parameter (the Mobbex limitation documented in BILLING-001 SPEC). The provider port `verifyWebhook` already implemented in `MobbexProvider` compares an `x-mobbex-signature` header — this feature must accept the secret via the query parameter as documented in the feature spec; if reusing `verifyWebhook` is impractical, the route may perform the secret comparison inline while delegating payload parsing only.
- A new Supabase migration is added under `apps/services/supabase/migrations/` creating `billing_webhook_events` with foreign keys `transaction_id REFERENCES transactions(id) ON DELETE SET NULL` and `subscription_id` declared but unconstrained (subscriptions table not yet present).
- All SQL stays inside repository files; no raw SQL is allowed in handlers, dispatcher, or routes (per backend conventions).
- Domain errors thrown from this module must extend `DomainError` from `shared/errors.ts` (`UnauthorizedError`, `ValidationError`).
- Environment variable `MOBBEX_WEBHOOK_SECRET` is read from a config module under `src/shared/configs/` rather than from `process.env` directly inside business code, in line with the backend conventions.

## Dependencies

- BILLING-001 — `PaymentProvider` port and `MobbexProvider` adapter (provides `verifyWebhook` and `MOBBEX_WEBHOOK_SECRET`).
- BILLING-002 — `transactions` table, `reference` and `provider_transaction_id` columns used for lookup.
- SERVICES-001 — base `apps/services` Fastify application.
