# Subscriptions module — Living Specification

Living functional spec describing what the subscriptions module currently does.

---

## Subscription plans catalog (SUBS-001)

The module persists subscription plans in the Supabase table `subscription_plans`. The table has columns `id` (uuid PK), `code` (text UNIQUE), `name`, `description`, `price` (numeric, `CHECK price >= 0`), `currency`, `interval` (`CHECK` constrained to `month` or `year`), `features` (jsonb — flat array of strings), `is_active` (boolean), `provider_plan_id` (text nullable), `created_at`, and `updated_at`.

Three seed plans are provided by the initial migration: `free` (price `0`), `pro` (price `12` USD/month), and `business` (price `49` USD/month). Seeds are inserted with `ON CONFLICT (code) DO NOTHING` so re-running the migration is safe.

`GET /billing/plans` is a public endpoint that requires no authentication. It returns `{ data: SubscriptionPlan[] }` — only plans with `is_active = true`, ordered by `price ASC`. The free plan (price `0`) is always included when active. Inactive plans are silently omitted; existing subscriptions referencing an inactive plan are not affected.

The `provider_plan_id` column is nullable. When a plan has no corresponding provider-side entry the field is `null`. Future features populate this field manually or via automated provisioning (BILLING-001).

The `SubscriptionPlan` interface is exported from `@repo/types` and is shared by both the backend module and any frontend consumer. The `features` field is a flat `string[]` with no nested objects, which keeps pricing UI rendering trivial.

The backend module follows the standard `handler → useCase → IRepository → DBRepository` vertical slice (`listPlansHandler` → `ListPlansUseCase` → `ISubscriptionPlanRepository` → `SubscriptionPlanDBRepository`). The route is registered in `apps/services/src/modules/subscriptions/routes.ts` with no `preHandler`, matching the public access requirement.

---

## Subscribe & cancel flow (SUBS-002)

The module persists user and organization subscriptions in the Supabase table `subscriptions`. The table has columns `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `plan_id` (FK → subscription_plans), `provider` (text), `provider_subscription_id` (text nullable), `status` (text, `CHECK` constrained to `pending` | `active` | `past_due` | `canceled` | `expired`), `current_period_start` (timestamptz nullable), `current_period_end` (timestamptz nullable), `cancel_at_period_end` (boolean, default `false`), `canceled_at` (timestamptz nullable), `created_at`, and `updated_at`. Two partial unique indexes enforce that at most one subscription with `status NOT IN ('canceled', 'expired')` exists per scope: `subscriptions_active_per_user` on `user_id` and `subscriptions_active_per_org` on `org_id`.

Three protected endpoints handle the subscribe/cancel lifecycle, all guarded by `requireAuth`:

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/billing/subscriptions` | Creates a subscription for the authenticated scope. Validates `planCode` against `subscription_plans WHERE is_active = true` (HTTP 400 if absent). Rejects with HTTP 409 if a non-terminal subscription already exists for the scope. For the `free` plan, creates the row with `status = 'active'` and `provider_subscription_id = null` without calling the provider, returning `{ subscriptionId }`. For paid plans, calls the billing provider's `createSubscription`, persists the row with `status = 'pending'` and the returned `provider_subscription_id`, and responds with `{ checkoutUrl, subscriptionId }`. |
| `POST` | `/billing/subscriptions/:id/cancel` | Cancels the identified subscription for the authenticated scope. Validates `atPeriodEnd` (boolean, default `true`). With `atPeriodEnd = true`, sets `cancel_at_period_end = true` on the local row and calls the provider to schedule cancellation at period end. With `atPeriodEnd = false`, sets `status = 'canceled'` and `canceled_at = now()` on the local row and calls the provider for immediate cancellation. A provider HTTP 404 response during cancellation of a `pending` subscription (abandoned checkout) is treated as success. |
| `GET` | `/billing/subscriptions/me` | Returns `{ subscription: SubscriptionEntity \| null }` — the non-terminal subscription for the authenticated scope, or `null` if none exists. |

Provider access goes exclusively through `resolveProvider()` from the billing module. The subscriptions module never imports a provider adapter directly. State convergence (renewals, payment failures, status updates from the provider) is not handled in this feature and is delegated to SUBS-003 webhooks.

The types `SubscriptionStatusValue`, `Subscription`, `CreateSubscriptionInput`, and `CancelSubscriptionInput` are exported from `@repo/types` and shared by the backend module and frontend consumers.
