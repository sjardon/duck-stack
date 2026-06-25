# SUBS-002 — Subscribe & Cancel Flow

## Reason for being

The subscription plans catalog already exists (SUBS-001), but users currently have no way to subscribe to any of those plans. The system lacks both the persistence layer for subscriptions and the orchestration that bridges the local subscription record with the external payment provider's checkout (Mobbex via the `billing` module). Without this, the catalog is a marketing artifact with no functional path forward.

This feature enables a user (or organization) to subscribe to a plan (other than `free`), be redirected to the provider's checkout to authorize the recurring debit, and come back with an active local subscription. It also lets the user cancel an existing subscription and query their current subscription state. State convergence with the provider (renewals, payment failures, etc.) is handled separately by SUBS-003 via webhooks; this feature is strictly the command-side flow.

## Scope

The requirements cover the `subscriptions` table schema, three protected endpoints (`POST /billing/subscriptions`, `POST /billing/subscriptions/:id/cancel`, `GET /billing/subscriptions/me`), the validation rules around them, and the integration with the `billing` provider port for create and cancel operations. Free-plan subscriptions are short-circuited locally (no provider call). Paid-plan subscriptions return a `checkoutUrl` for the frontend to redirect to. Cancellation supports both immediate and end-of-period semantics.

## Out of scope

- Change plan / upgrade / downgrade (deferred to a future feature).
- Prorating or credits for early cancellation.
- Pause / resume of subscriptions.
- Multi-subscription simultaneously per scope.
- Alternative payment methods other than card.
- Automatic reactivation after `past_due`.
- Webhook-driven state convergence (covered by SUBS-003).
- Cleanup of stale `pending` subscriptions left by abandoned checkouts.
- Frontend UI for subscribe / cancel (covered by SUBS-004).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall persist subscriptions in a Supabase table `subscriptions` with columns `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `plan_id` (FK → subscription_plans), `provider` (text), `provider_subscription_id` (text nullable), `status` (text constrained to `pending` \| `active` \| `past_due` \| `canceled` \| `expired`), `current_period_start` (timestamptz nullable), `current_period_end` (timestamptz nullable), `cancel_at_period_end` (boolean default `false`), `canceled_at` (timestamptz nullable), `created_at`, and `updated_at`. |
| R002 | Ubiquitous | The system shall enforce a uniqueness constraint such that at most one subscription with `status NOT IN ('canceled','expired')` exists per scope (`user_id`, `org_id`). |
| R003 | Event-driven | WHEN a `POST /billing/subscriptions` request arrives, the system shall require authentication via `requireAuth` and validate the request body with Zod, accepting only a `planCode` that matches an active plan in `subscription_plans`. |
| R004 | Conditional | IF the `planCode` in `POST /billing/subscriptions` resolves to the `free` plan, THEN the system shall create the subscription locally with `status = 'active'` and `provider_subscription_id = null`, without calling the billing provider. |
| R005 | Conditional | IF the `planCode` in `POST /billing/subscriptions` resolves to a non-free active plan, THEN the system shall call the billing provider's `createSubscription`, persist the local subscription with `status = 'pending'` and the returned `provider_subscription_id`, and respond with `{ checkoutUrl, subscriptionId }`. |
| R006 | Conditional | IF the authenticated scope already has a subscription with `status NOT IN ('canceled','expired')` when `POST /billing/subscriptions` is called, THEN the system shall respond with HTTP 409 `VALIDATION_ERROR` and the message `"user/org already has an active subscription"`. |
| R007 | Conditional | IF the `planCode` in `POST /billing/subscriptions` does not match any plan with `is_active = true`, THEN the system shall respond with HTTP 400 `VALIDATION_ERROR`. |
| R008 | Event-driven | WHEN a `POST /billing/subscriptions/:id/cancel` request arrives, the system shall require authentication via `requireAuth` and validate the body with Zod, accepting an `atPeriodEnd` boolean (default `true`). |
| R009 | Conditional | IF `POST /billing/subscriptions/:id/cancel` is called with `atPeriodEnd = true`, THEN the system shall set `cancel_at_period_end = true` on the local subscription, keep the current `status`, and call the billing provider's `cancelSubscription` to schedule cancellation at period end. |
| R010 | Conditional | IF `POST /billing/subscriptions/:id/cancel` is called with `atPeriodEnd = false`, THEN the system shall set `status = 'canceled'` and `canceled_at = now()` on the local subscription, and call the billing provider's `cancelSubscription` to cancel immediately. |
| R011 | Event-driven | WHEN a `GET /billing/subscriptions/me` request arrives, the system shall require authentication via `requireAuth` and respond with the subscription belonging to the authenticated scope whose `status NOT IN ('canceled','expired')`, or `null` if none exists. |
| R012 | Ubiquitous | The system shall expose the types `Subscription`, `CreateSubscriptionInput`, and `CancelSubscriptionInput` from `@repo/types` for use by the backend module and the frontend client. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The system shall validate `planCode` and `atPeriodEnd` using Zod schemas before any database or provider interaction. |
| NF002 | The system shall delegate state convergence with the provider (renewals, payment failures, status flips) to SUBS-003 webhooks; this feature shall only issue commands and shall not poll the provider. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a user invokes `POST /billing/subscriptions/:id/cancel` on a subscription currently in `status = 'pending'` (checkout not yet completed), the system shall cancel the subscription locally (per R009/R010 semantics) and attempt to cancel it in the provider; if the provider responds with HTTP 404 (subscription unknown), the system shall treat it as a successful cancellation and respond with HTTP 200. |
| EC002 | WHEN `POST /billing/subscriptions` is called with `planCode` resolving to the `free` plan, the system shall create the subscription with `status = 'active'` and `provider_subscription_id = null` without calling the billing provider. |
| EC003 | WHEN `POST /billing/subscriptions` is called by a scope whose previous subscription is in `status = 'canceled'` or `status = 'expired'`, the system shall allow creating a new subscription and shall not return 409. |
| EC004 | WHEN a user abandons the checkout after `POST /billing/subscriptions` (paid plan), the local subscription shall remain in `status = 'pending'` indefinitely; the system shall not auto-clean such rows and shall rely on SUBS-003 webhooks to activate them or leave them as-is (assumption: orphan cleanup is documented as out of scope). |

## Technical constraints

- Backend module: extend `apps/services/src/modules/subscriptions/`.
- Shared types in `@repo/types`: `Subscription`, `CreateSubscriptionInput`, `CancelSubscriptionInput`.
- Authentication is provided by `requireAuth` from AUTH-001.
- The provider integration must go through the abstract port defined by BILLING-001 (`createSubscription`, `cancelSubscription`); this feature shall not import Mobbex (or any provider-specific) clients directly.
- Persistence is Supabase; the table schema and uniqueness constraint must be created via a Supabase migration.
- Depends on SUBS-001 for the `subscription_plans` table and the active-plan validation.
