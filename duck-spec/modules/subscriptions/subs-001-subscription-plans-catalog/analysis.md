# SUBS-001 — Subscription Plans Catalog

## Reason for being

To sell subscriptions, the product needs a catalog of plans that the frontend can render in the pricing page and that the backend can validate when a user attempts to subscribe. The plans must be configurable without requiring a redeploy of the application.

This feature defines the plan data model, its persistence in Supabase, the initial seed (free, pro, business), and a public endpoint that lists the available plans. It also introduces the linkage between local plans and their counterpart in the external payment provider via `provider_plan_id`.

## Scope

The requirements cover the persistence schema for subscription plans, the public read endpoint that exposes the active catalog ordered by price, the initial data seed with three plans (free, pro, business), and the structural support for binding each local plan to a provider-side plan identifier. No write operations are exposed by the API.

## Out of scope

- Editing plans from an admin UI (changes happen via migration / seed)
- Plans with add-ons, packs or usage-based pricing
- Coupons, discounts or trials with promotional codes
- One-shot / lifetime / fixed-duration plans

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall persist subscription plans in a Supabase table `subscription_plans` with columns `id` (uuid PK), `code` (text unique), `name` (text), `description` (text), `price` (numeric), `currency` (text), `interval` (text constrained to `month` or `year`), `features` (jsonb), `is_active` (boolean), `provider_plan_id` (text nullable), `created_at` and `updated_at`. |
| R002 | Event-driven | WHEN a client issues `GET /billing/plans` without authentication, the system shall respond with the list of subscription plans whose `is_active = true`, ordered by `price` ascending. |
| R003 | Ubiquitous | The system shall provide an initial Supabase seed with three plans whose `code` values are `free` (price `0`), `pro` (price greater than `0`) and `business` (price greater than `0`). |
| R004 | Ubiquitous | The system shall allow each subscription plan to reference its counterpart in the external payment provider through the `provider_plan_id` column, which may be null when no provider-side plan is linked. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | `GET /billing/plans` shall respond in under 200ms. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `GET /billing/plans` returns a plan with `price = 0` (free plan), the system shall include it in the response payload so the frontend can render it as the "Free" tier, and downstream subscription creation (SUBS-002) shall skip the call to the external payment provider for that plan. |
| EC002 | WHEN a plan has `is_active = false`, the system shall omit it from the `GET /billing/plans` response while preserving any existing subscriptions referencing that plan unchanged in the database. |

## Technical constraints

- Backend module lives under `apps/services/src/modules/subscriptions/`.
- Persistence is implemented via a Supabase migration that creates the `subscription_plans` table and inserts the seed rows.
- Shared TypeScript type `SubscriptionPlan` is published from `@repo/types` and consumed by both backend and frontend.
- The `features` column is a flat array of strings (no nested objects) to keep the pricing UI rendering trivial.
- Depends on SERVICES-001 (backend bootstrap). BILLING-001 is optional and only required if the provider plan provisioning is automated; otherwise `provider_plan_id` is populated manually by the operator.
