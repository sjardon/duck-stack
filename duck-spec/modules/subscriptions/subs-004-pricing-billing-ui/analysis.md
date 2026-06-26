# SUBS-004 — Pricing Page & Billing Settings UI

## Reason for being

The subscriptions backend is fully in place: `GET /billing/plans` returns the active catalog (SUBS-001) and `POST /billing/subscriptions`, `POST /billing/subscriptions/:id/cancel`, `GET /billing/subscriptions/me` cover the lifecycle (SUBS-002), with provider-driven state convergence handled by SUBS-003 webhooks. End users still have no way to interact with any of this — the pricing catalog is invisible on the marketing site, the checkout cannot be triggered from the authenticated app, and there is no UI to inspect or cancel an existing subscription.

This feature exposes those operations to the end user across the two frontends. The marketing SPA (`apps/landing`) gains a public pricing surface that funnels visitors into sign-up; the authenticated SPA (`apps/web`) gains a redirector page that converts a plan code into a backend subscription and a billing settings page that displays and manages the current subscription.

## Scope

The requirements cover three user-facing surfaces: a public pricing section in `apps/landing` (grid of plans + sign-up CTA), a `/billing/subscribe` redirector page in `apps/web` that consumes `?plan=<code>` and routes the user to the provider's checkout, and a protected `/billing` page in `apps/web` that renders the current subscription with status badges and a cancel action. Cross-cutting concerns include React Query wiring on the authenticated app, the shared client API modules per app, and the domain component layout under `components/domain/billing/`.

## Out of scope

- Dashboard of historical transactions (future feature).
- Card vista / last-4-digits display — owned by the provider portal.
- Editing the payment method from `apps/web`.
- Trial countdown UI.
- Upgrade / downgrade / change-plan flows.
- Reactivation of a `canceled` or `expired` subscription from the UI.
- Backend changes — this feature consumes existing SUBS-001/SUBS-002 endpoints unchanged.
- Pricing surface in `apps/web` outside of the `/billing` page (no global `/pricing` route in `apps/web` for this iteration).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN the user visits the pricing surface in `apps/landing`, the system shall call `GET /billing/plans` and render one card per returned plan ordered as received, displaying `name`, `price` formatted as currency, `interval`, the `features` list, and a CTA button. |
| R002 | Event-driven | WHEN the user clicks the CTA on a plan card in `apps/landing`, the system shall navigate the browser to `/sign-up?next=/billing/subscribe?plan=<code>` on the `apps/web` origin, where `<code>` is the plan's `code`. |
| R003 | Event-driven | WHEN the authenticated user lands on `/billing/subscribe` in `apps/web` with a `?plan=<code>` query parameter that matches an active plan, the system shall call `POST /billing/subscriptions` with `{ planCode: <code> }` and, upon receiving a response containing `checkoutUrl`, redirect the browser to that URL. |
| R004 | Conditional | IF `POST /billing/subscriptions` responds without a `checkoutUrl` (free-plan branch), THEN the system shall navigate the user to `/billing` instead of redirecting externally. |
| R005 | Ubiquitous | The system shall expose a `/billing` route in `apps/web` gated by `AuthGuard` that calls `GET /billing/subscriptions/me` and renders the current subscription's plan name, status badge, and `current_period_end` formatted as a date. |
| R006 | Conditional | IF `GET /billing/subscriptions/me` returns `null`, THEN the system shall render a "You are on the free plan" empty state on `/billing` with a CTA that links the user to the pricing surface. |
| R007 | Event-driven | WHEN the user clicks the "Cancel" button on `/billing`, the system shall open a confirmation dialog that, upon confirmation, calls `POST /billing/subscriptions/:id/cancel` with `{ atPeriodEnd: true }` and refreshes the subscription query on success. |
| R008 | Ubiquitous | The system shall render the subscription status as a color-coded badge with distinct visual treatments for `pending`, `active`, `past_due`, and `canceled`. |
| R009 | Conditional | IF the cancel-confirmation dialog is dismissed without confirming, THEN the system shall not call `POST /billing/subscriptions/:id/cancel` and shall leave the subscription state unchanged. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The system shall disable the "Cancel" button and any plan-card CTA while the corresponding mutation (`POST /billing/subscriptions/:id/cancel`, `POST /billing/subscriptions`) is in flight, so the same request cannot be triggered twice. |
| NF002 | The system shall render a non-blocking error state (message + retry affordance) when `GET /billing/plans` or `GET /billing/subscriptions/me` fails, rather than crashing the page or leaving it blank. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the current subscription returned by `GET /billing/subscriptions/me` has `status = 'past_due'`, the system shall render the red `past_due` badge plus the inline message "Your last payment failed — please update your payment method" and an external link to the provider's customer portal. |
| EC002 | WHEN the current subscription has `status = 'canceled'` and `current_period_end` is in the future, the system shall render the `canceled` badge with the secondary line "Canceled — access ends `<formatted current_period_end>`" and shall not show the "Cancel" button. |
| EC003 | WHEN the current subscription's `plan` is no longer active in the catalog (`is_active = false` or absent from `GET /billing/plans`), the system shall still render the plan name on `/billing` with a "legacy plan" label and shall not offer an upgrade affordance for this iteration. |
| EC004 | WHEN `/billing/subscribe` is loaded without a `?plan` query parameter, or with a `?plan=<code>` that the backend rejects (HTTP 400 from `POST /billing/subscriptions`), the system shall render an error message and a CTA that navigates the user back to the pricing surface in `apps/landing`. |
| EC005 | WHEN `/billing/subscribe` is loaded for an authenticated user whose scope already has a non-terminal subscription and the backend responds with HTTP 409, the system shall render a message stating the user already has an active subscription and provide a CTA to `/billing`. |
| EC006 | WHEN `GET /billing/plans` returns an empty array, the system shall render an "No plans available right now" empty state on the pricing surface instead of an empty grid. |

## Technical constraints

- `apps/landing` is the only place the public pricing surface lives; the new section file is `apps/landing/src/components/sections/Pricing.tsx` and a new `apps/landing/src/api/plans.ts` module exposing `listPlans()` is added. `apps/landing` must not introduce React Query, Zustand, or `@repo/types` — per [[`apps/landing` — Marketing SPA structure]] those are intentional exclusions. `listPlans()` may use `fetch` directly and may inline a minimal local type for the response.
- `apps/web` data access goes through `apiFetch` in `api/client.ts`; the new module `apps/web/src/api/billing.ts` exports `listPlans`, `subscribe`, `getMySubscription`, and `cancelSubscription`, each accepting a bearer token where the underlying endpoint requires auth.
- React Query is mandatory in `apps/web` for plans and subscription reads, via the hooks `usePlans`, `useMySubscription`, and the mutation hook `useCancelSubscription`. Pages are the only layer that may call these hooks (see `apps/web` layered architecture rules).
- Domain components live under `apps/web/src/components/domain/billing/` and include at minimum `PlanCard`, `SubscriptionStatusCard`, and `CancelDialog`. They must receive all data via props from page-level components and must not call hooks that fetch data.
- Shared TypeScript types `SubscriptionPlan`, `Subscription`, `CreateSubscriptionInput`, `CancelSubscriptionInput`, and `SubscriptionStatusValue` are imported from `@repo/types` in `apps/web` only.
- The `/billing` route in `apps/web` must be mounted under `AuthGuard`; per the layered architecture rules, page components must not duplicate the onboarding/auth checks.
- The cross-app navigation in R002 targets the `apps/web` origin via an absolute URL configured from `VITE_WEB_URL` (or equivalent env-var convention) so dev and production work without code changes; hardcoded hosts are not acceptable.
- Depends on SUBS-001 (`GET /billing/plans`), SUBS-002 (subscribe, cancel, me endpoints and the `{ checkoutUrl, subscriptionId }` response contract), and AUTH-001 (`AuthGuard`, Clerk session token).
