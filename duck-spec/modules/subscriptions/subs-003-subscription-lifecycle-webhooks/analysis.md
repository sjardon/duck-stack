# SUBS-003 — Subscription Lifecycle Webhooks

## Reason for being

The `subscriptions` table (SUBS-002) holds the local mirror of each user/org subscription, but its state only converges to the provider's reality through asynchronous notifications. Mobbex emits recurring subscription events (initial activation, renewal, payment failure, cancellation, expiration) that the local system currently has no consumer for, so after a subscription is created the local `status`, `current_period_start`, `current_period_end`, and `canceled_at` quickly drift out of sync with the provider.

Process Mobbex subscription lifecycle webhooks through the existing `POST /webhooks/billing/mobbex` endpoint (BILLING-003) by dispatching to dedicated subscription handlers that mutate the `subscriptions` row, persist the raw event in `billing_webhook_events`, and behave idempotently against duplicate deliveries — keeping the local state authoritative for downstream entitlement and quota logic.

## Scope

The requirements cover the inbound webhook path for subscription events only: dispatch from the shared endpoint, per-event-type state transitions, persistence of the raw payload, idempotency by current state and by `event_id`, structured logging, and safe handling of unknown / orphan / out-of-order events. Endpoint registration, secret verification, raw-body parsing, and the `billing_webhook_events` table itself are inherited unchanged from BILLING-003.

## Out of scope

- Email notifications to the end user on payment failure (deferred to the notifications module)
- Custom dunning logic or payment retries (Mobbex owns retry; this feature only reflects outcomes)
- Churn metrics, dashboards, or analytics
- Recovery / self-service flow out of `past_due`
- Webhook replay or manual reprocessing UI
- Changes to BILLING-003's transaction handlers, secret check, or endpoint registration

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN `POST /webhooks/billing/mobbex` receives a verified event, the system shall route it to the subscription dispatcher if the payload's event type matches a registered subscription event, otherwise leave it to the transaction handler defined by BILLING-003. |
| R002 | Event-driven | WHEN a `subscription.activated` (or equivalent initial-payment-approved) event is received and resolves to a local subscription, the system shall set `subscriptions.status = 'active'` and populate `current_period_start` and `current_period_end` from the payload. |
| R003 | Event-driven | WHEN a `subscription.renewed` (or equivalent recurring-payment-approved) event is received and resolves to a local subscription, the system shall update `current_period_end` to the period end indicated by the payload. |
| R004 | Conditional | IF a `subscription.renewed` event is received for a subscription whose current `status = 'past_due'`, THEN the system shall set `subscriptions.status = 'active'`. |
| R005 | Event-driven | WHEN a `subscription.payment_failed` event is received and resolves to a local subscription whose status is not `canceled` or `expired`, the system shall set `subscriptions.status = 'past_due'`. |
| R006 | Event-driven | WHEN a `subscription.canceled` event is received and resolves to a local subscription, the system shall set `subscriptions.status = 'canceled'` and set `canceled_at = now()`. |
| R007 | Event-driven | WHEN a `subscription.expired` event is received and resolves to a local subscription, the system shall set `subscriptions.status = 'expired'`. |
| R008 | Ubiquitous | The system shall persist every received subscription event in `billing_webhook_events` with `provider`, `event_type`, raw `payload`, `received_at`, and `subscription_id` set when the event resolves to a local subscription. |
| R009 | Conditional | IF an incoming event's target status equals the current `subscriptions.status` and the payload-driven period fields match the stored values, THEN the system shall skip the mutation and respond HTTP 200. |
| R010 | Conditional | IF the payload includes a Mobbex `event_id` already recorded in `billing_webhook_events` for the same `provider`, THEN the system shall skip processing and respond HTTP 200. |
| R011 | Event-driven | WHEN any subscription event is fully processed (mutation, no-op, or unknown-type acknowledged), the system shall respond HTTP 200. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The webhook handler shall return its HTTP response in under 5 seconds, matching BILLING-003. |
| NF002 | Each processed subscription event shall emit a structured log line containing `event_type`, `provider_subscription_id`, `subscription_id` (or `null`), and `outcome` (`applied` \| `noop` \| `unknown` \| `orphan` \| `duplicate`). |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a `subscription.renewed` event arrives for a local subscription that has never received `subscription.activated`, the system shall set `status = 'active'`, populate `current_period_start` and `current_period_end` from the payload, and respond HTTP 200. |
| EC002 | WHEN a `subscription.payment_failed` event arrives for a local subscription whose `status` is already `canceled` or `expired`, the system shall leave the row unchanged, log a warning with `outcome = 'noop'`, and respond HTTP 200. |
| EC003 | WHEN an event's `provider_subscription_id` does not match any row in `subscriptions`, the system shall persist the event in `billing_webhook_events` with `subscription_id = null`, log a warning with `outcome = 'orphan'`, and respond HTTP 200. |
| EC004 | WHEN an event of an unrecognized type is received, the system shall persist the raw payload in `billing_webhook_events`, log a warning with `outcome = 'unknown'`, leave all `subscriptions` rows unchanged, and respond HTTP 200. |
| EC005 | WHEN the same `event_id` is delivered more than once, the system shall persist only the first occurrence in `billing_webhook_events`, skip the mutation on subsequent deliveries, log with `outcome = 'duplicate'`, and respond HTTP 200. |

## Technical constraints

- Backend implementation lives under `apps/services/src/modules/webhooks/mobbex/` as an extension, not a fork, of the BILLING-003 module.
- `MobbexBillingSyncRepository` is extended with `updateSubscriptionStatus(...)` and the existing `recordEvent(...)` is reused (with `subscription_id` populated).
- The mapping from Mobbex event type → internal handler is declared as a small static table inside the module (no DB, no per-request lookup).
- Subscriptions are resolved by `provider_subscription_id` against `subscriptions` (column added in SUBS-002).
- Secret verification, raw-body parsing, and endpoint registration are inherited from BILLING-003 — this feature must not duplicate or modify them.
- The `event_id` idempotency check (R010) reuses the existing `billing_webhook_events` table; no schema changes beyond ensuring `event_id` (if present in payload) is stored in a queryable form (column or indexed JSONB path) consistent with BILLING-003's storage.
