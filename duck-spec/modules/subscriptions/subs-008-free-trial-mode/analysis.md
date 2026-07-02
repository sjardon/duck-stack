# SUBS-008 — Free Trial Mode (backend)

## Reason for being

SUBS-006 already covers the freemium model: new users lazily land on a permanent `free` subscription. The starter pack must also support the alternative "free trial" model, where every new user starts with a trial of the most expensive plan and, once it expires, must explicitly pick a plan (including `free` if it exists in the catalog) to keep using the app. The operator adopting the starter selects one of the two models via configuration; both models never coexist for the same project.

The goal of this feature is to introduce the `free_trial` mode to the starter pack. On signup, the user automatically receives a `trialing` subscription of the most expensive active plan, with a configurable duration. When the trial expires, access to protected routes is blocked until the user explicitly picks a plan.

## Scope

The requirements cover: a new `SIGNUP_MODE` and `FREE_TRIAL_DAYS` environment configuration, a migration that extends the `subscriptions.status` CHECK constraint with `trialing` and adds a `trial_ends_at` column, the mode-aware extension of the Clerk `user.created` webhook handler, a lazy `trialing → expired` transition on subscription reads, a new `requireActiveSubscription` preHandler that blocks expired-trial users everywhere except billing routes and webhooks, coordination with SUBS-006's `ensureActiveSubscription` helper, and the extension of `GET /billing/subscriptions/me` to expose trial fields.

## Out of scope

- Frontend UI for trial state and expiration screens (covered by SUBS-009).
- Trials triggered via coupon code or a special invite link.
- Card-required trials that automatically charge at the end.
- Trials against multiple plans or per-user eligibility rules.
- Email notifications such as "your trial expires in N days" (deferred to a future notifications module).
- Re-trial under any flow: the trial fires only once, on the first `user.created` webhook Clerk delivers for that user.
- Modifications to the freemium mode's behavior or to SUBS-006 when an active subscription already exists.
- Admin ability to shorten or extend a trial.
- Retroactive backfill of trials for existing users when the mode is switched.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall expose a `SIGNUP_MODE` environment variable accepting the values `freemium` or `free_trial`, defaulting to `freemium`. |
| R002 | Ubiquitous | The system shall expose a `FREE_TRIAL_DAYS` environment variable of integer type, defaulting to `14`. |
| R003 | Ubiquitous | The system shall provide a Supabase migration that adds `trialing` to the CHECK constraint of `subscriptions.status` and adds the column `trial_ends_at` (timestamptz, nullable) to the `subscriptions` table. |
| R004 | Event-driven | WHEN the Clerk `user.created` webhook is processed and `SIGNUP_MODE = free_trial`, the system shall create a subscription for that user with `status = 'trialing'`, `plan_id` set to the active plan with the highest `price`, `trial_ends_at = now() + FREE_TRIAL_DAYS days`, `current_period_start = now()`, and `current_period_end = trial_ends_at`. |
| R005 | Event-driven | WHEN the Clerk `user.created` webhook is processed and `SIGNUP_MODE = freemium`, the system shall not create any subscription (preserving the current behavior in which SUBS-006 handles the lazy `free` creation). |
| R006 | Conditional | IF a subscription is read for a scope and its `status = 'trialing'` and `trial_ends_at < now()`, THEN the system shall update that subscription's `status` to `'expired'` within the same operation. |
| R007 | Conditional | IF `SIGNUP_MODE = free_trial`, the latest subscription for the scope is `expired`, and no other `active` or `trialing` subscription exists for that scope, THEN the `requireActiveSubscription` preHandler shall return HTTP 403 with error code `TRIAL_EXPIRED` and a body containing `{ trialEndedAt }`. |
| R008 | Ubiquitous | The system shall apply the `requireActiveSubscription` preHandler as a global guard on all authenticated routes, except routes under `/billing/*`, the public catalog endpoint `GET /billing/plans`, and webhook endpoints. |
| R009 | Conditional | IF `SIGNUP_MODE = free_trial`, THEN the system shall disable the lazy `free` subscription creation introduced in SUBS-006 (blocking via `requireActiveSubscription` occurs first), while SUBS-006 continues to operate normally for scopes that already hold any active subscription. |
| R010 | Event-driven | WHEN a client calls `GET /billing/subscriptions/me` and the current subscription's `status = 'trialing'`, the system shall include `trial_ends_at` and `days_remaining` (integer, whole days from `now()` to `trial_ends_at`, minimum `0`) in the response. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Creation of the `trialing` subscription shall be idempotent with respect to the `user.created` webhook: retries from Clerk shall not result in duplicate subscriptions, relying on the SUBS-002 unique constraint over non-terminal subscriptions per scope. |
| NF002 | The "most expensive plan" resolution shall be performed at runtime while processing the webhook, without caching, selecting the plan with the highest `price` among `is_active = true` rows. |
| NF003 | IF `SIGNUP_MODE = free_trial` and no active plan with `price > 0` exists at webhook time, THEN the system shall log an error and fail the trial creation silently; the user remains without a subscription and will be blocked by `requireActiveSubscription` on the first protected request. |
| NF004 | The lazy `trialing → expired` transition shall be safe under concurrency: the UPDATE statement shall filter by `status = 'trialing'` so that exactly one transition takes effect. |
| NF005 | The `SubscriptionStatus` union type in `@repo/types` shall be extended to include `trialing`, and the `Subscription` type shall include the optional fields `trial_ends_at` and `days_remaining`. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a user's trial expires while they are browsing and they issue a subsequent protected request, the system shall trigger the lazy transition and return HTTP 403 with code `TRIAL_EXPIRED`. |
| EC002 | WHEN an operator changes `SIGNUP_MODE` from `freemium` to `free_trial` with existing users in the system, the system shall not grant retroactive trials to those users and shall only create trials for new signups after the change. |
| EC003 | WHEN an operator changes `SIGNUP_MODE` from `free_trial` to `freemium`, the system shall let in-progress trials run to their natural expiration and shall route new signups to the freemium flow. |
| EC004 | WHEN a user on an active trial calls `POST /billing/subscriptions` to subscribe to a paid plan, the system shall set the trial subscription's `status = 'canceled'` and create the new subscription according to SUBS-002. |
| EC005 | WHEN a user with an expired trial navigates under `/billing/*`, the system shall allow the request (bypassing `requireActiveSubscription`) so the user can view their subscription and select a plan. |
| EC006 | WHEN the most expensive plan is deactivated (`is_active = false`) after a user has already started a trial, the system shall keep that user's trial running normally with the plan assigned at trial creation. |
| EC007 | WHEN a trial's `trial_ends_at` equals `now()` exactly, the system shall not treat it as expired (comparison is strictly `trial_ends_at < now()`). |
| EC008 | WHEN two concurrent `user.created` webhooks arrive for the same user, the system shall let the SUBS-002 unique constraint reject the second insert and shall catch the error and respond with HTTP 200 (idempotent behavior). |

## Technical constraints

- Backend: extend the Clerk webhook handler under `apps/services/src/modules/webhooks/clerk/`.
- Backend: introduce a new preHandler under `apps/services/src/modules/subscriptions/`.
- Supabase migration updating the CHECK constraint on `subscriptions.status` and adding the `trial_ends_at` column.
- Extend the `ensureActiveSubscription` helper (introduced in SUBS-006) to be mode-aware.
