# SUBS-005 — Entitlements / Feature Gates

## Reason for being

With active subscriptions in place (SUBS-002), the product needs to gate functionality by plan. Without a centralized gate, each feature would implement its own check, producing duplication and inconsistency across backend and frontend.

This feature defines a single `plan.code → entitlements` mapping and exposes a uniform authorization mechanism on both sides of the wire: a Fastify `preHandler` for backend routes and a React hook plus gating component for the frontend.

## Scope

Defines a backend-owned, code-level mapping from plan codes to entitlement names and provides the runtime primitives that consume it: an authorization preHandler, a public endpoint that returns the current scope's entitlements, a React Query–backed hook, and a render-gating component. Resolution accounts for subscription status (active, past_due, canceled-but-period-valid) and falls back to the `free` plan when no subscription exists.

## Out of scope

- Per-seat or usage-based entitlements (usage limits, metering, tracking)
- Automatic trial entitlements
- Admin-side manual override of a scope's entitlements
- Persisting the plan→entitlements mapping in the database
- Editing entitlements without a redeploy

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall define a mapping from `plan.code` to an array of entitlement names in backend code (not in the database), exported with its types so backend and frontend reference the same constants. |
| R002 | Event-driven | WHEN a request reaches a handler protected by the `requireEntitlement(name)` preHandler, the system shall resolve the authenticated scope's active subscription, derive the entitlements for its plan, and expose them on `request.entitlements`. |
| R003 | Conditional | IF the resolved entitlements for the request include `name`, THEN the system shall allow the request to proceed to the route handler. |
| R004 | Conditional | IF the resolved entitlements for the request do not include `name`, THEN the system shall respond with HTTP 403 and a domain error code `ENTITLEMENT_REQUIRED`. |
| R005 | Event-driven | WHEN `GET /billing/entitlements/me` receives an authenticated request, the system shall return the array of entitlements resolved from the scope's active subscription, or from the `free` plan if the scope has no active subscription. |
| R006 | Ubiquitous | The system shall protect `GET /billing/entitlements/me` with the `requireAuth` preHandler and reject unauthenticated requests with HTTP 401. |
| R007 | Event-driven | WHEN the React hook `useEntitlement(name)` mounts in a component, the system shall fetch `GET /billing/entitlements/me` through React Query and return `true` if the response array includes `name`, `false` otherwise. |
| R008 | Conditional | IF `<EntitlementGate name="...">` is rendered and the entitlement is present for the current user, THEN the system shall render its `children`. |
| R009 | Conditional | IF `<EntitlementGate name="...">` is rendered and the entitlement is absent for the current user, THEN the system shall render a fallback element (default: an upgrade CTA) instead of `children`. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Within a single request, `requireEntitlement` shall resolve the scope's active subscription and entitlements at most once and reuse them for subsequent `requireEntitlement` checks via `request.entitlements`. |
| NF002 | The `useEntitlement` hook shall issue at most one `GET /billing/entitlements/me` request per React Query `staleTime` window of at least 5 minutes per browser session, regardless of how many components consume it. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the authenticated scope has no row in `subscriptions` (or only rows with status `canceled`/`expired` past their period), the system shall resolve entitlements from the `free` plan's mapping entry. |
| EC002 | WHEN the resolved plan (including `free`) does not contain the required entitlement, the system shall return HTTP 403 with code `ENTITLEMENT_REQUIRED` from the backend and the frontend `<EntitlementGate>` shall render the upgrade CTA fallback. |
| EC003 | WHEN the scope's active subscription has status `past_due` and the environment variable `STRICT_ENTITLEMENTS_ON_PAST_DUE` is unset or `false`, the system shall keep granting the plan's entitlements; WHEN that env var is `true`, the system shall treat the subscription as if no entitlements were granted (falling back to the `free` plan per EC001). |
| EC004 | WHEN the scope's subscription has status `canceled` and `current_period_end > now()`, the system shall continue resolving entitlements from the cancelled subscription's plan until `current_period_end` elapses. |
| EC005 | WHEN `GET /billing/entitlements/me` is called without valid authentication, the system shall respond with HTTP 401 and the React Query hook shall treat the response as "no entitlements" without throwing in consumers. |

## Technical constraints

- The plan→entitlement mapping and the `EntitlementName` string-literal union live in `apps/services/src/modules/subscriptions/entitlements.ts` and are re-exported through `@repo/types` so the frontend imports the same constants.
- Backend is the single source of truth for entitlement resolution; the frontend never recomputes the mapping — it only consumes the array returned by `GET /billing/entitlements/me`.
- The 403 response from `requireEntitlement` reuses the existing domain-error pipeline so the error code `ENTITLEMENT_REQUIRED` is surfaced consistently to clients.
- The Fastify request augmentation that adds `request.entitlements` is declared in the same module as `requireEntitlement`.

## Dependencies

- SUBS-001 — provides `subscription_plans.code` values that the mapping keys off.
- SUBS-002 — provides the active subscription per scope (`GET /billing/subscriptions/me` semantics) used to resolve the plan.
