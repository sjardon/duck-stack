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
