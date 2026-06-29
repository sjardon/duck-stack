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

---

## Entitlements / Feature Gates (SUBS-005)

The module defines a code-level mapping from `plan.code` to an array of `EntitlementName` values in `apps/services/src/modules/subscriptions/entitlements.ts`. The three seed plans map as follows: `free` has no entitlements; `pro` grants `advanced_analytics`, `priority_support`, and `api_access`; `business` additionally grants `team_collaboration` and `white_label`. This mapping is the backend's single source of truth — no entitlement resolution occurs from the database.

Entitlement resolution rules applied by `GetEntitlementsUseCase`:

| Subscription state | Resolved entitlements |
|---|---|
| No subscription (or all rows `canceled`/`expired` past period) | `free` plan mapping |
| `past_due` with `STRICT_ENTITLEMENTS_ON_PAST_DUE=true` | `free` plan mapping |
| `canceled` with `current_period_end > now()` | Subscription's plan mapping |
| `active`, `pending`, `past_due` (non-strict) | Subscription's plan mapping |

The repository method `findActiveOrWithinPeriodByScope` returns a single `SubscriptionWithPlanEntity` (extending `SubscriptionEntity` with `plan_code`) via a JOIN query against `subscription_plans`. Active/pending/past_due rows are prioritized over canceled-within-period rows via an `ORDER BY CASE` expression, so no wall-clock tie-breaking is needed in the use case.

`GET /billing/entitlements/me` (protected by `requireAuth`) returns `{ entitlements: EntitlementName[] }` resolved from the authenticated scope's active subscription, or from the `free` plan if no subscription exists.

The `requireEntitlement(name)` preHandler factory in `apps/services/src/modules/subscriptions/plugins/requireEntitlement.ts` gates routes by entitlement name. Module-scope instances of `GetEntitlementsUseCase` and `SubscriptionDBRepository` are created once at plugin load; on the first invocation within a request the resolved array is cached on `request.entitlements` (a `FastifyRequest` augmentation declared in the same file) so that subsequent `requireEntitlement` calls on the same request skip the database entirely. When the required entitlement is absent the preHandler throws `EntitlementRequiredError` (HTTP 403, code `ENTITLEMENT_REQUIRED`).

`subscriptionsConfig.ts` (in `src/shared/configs/`) owns the `STRICT_ENTITLEMENTS_ON_PAST_DUE` environment variable, following the project convention that all env-var access is isolated to config files.

On the frontend, `useEntitlement(name: EntitlementName): boolean` in `apps/web/src/hooks/use-entitlement.ts` fetches `GET /billing/entitlements/me` via React Query with a `staleTime` of 5 minutes and query key `['billing', 'entitlements', 'me']`. All components that call `useEntitlement` share this key, deduplicating the fetch across the component tree. A 401 response is caught and treated as an empty entitlement array without propagating an error to consumers. `<EntitlementGate name="...">` in `apps/web/src/components/domain/billing/EntitlementGate.tsx` renders its `children` when the entitlement is present, or a `fallback` prop (defaulting to an inline upgrade CTA) when it is absent.

---

## Quota UI Gates (SUBS-007)

The frontend exposes quota state to React component trees via two primitives in `apps/web`.

`useQuota(name: QuotaName)` in `apps/web/src/hooks/useQuota.ts` fetches `GET /billing/quotas/me` via React Query under the shared key `['billing', 'quotas', 'me']` with a `staleTime` of 60 seconds and `refetchOnWindowFocus: true`. All instances on a given page share a single cache entry, issuing at most one network request per stale window. The hook filters the response array to the entry matching `name` and returns `{ count, soft_limit, hard_limit, state, period_end, isLoading }`. When no entry matches `name` (the scope's plan defines no such quota), the hook returns `state = 'normal'` and `hard_limit = Infinity`. While the initial fetch is in flight, `isLoading` is `true` and `state` is `'normal'`, so the component tree is never blocked during first load. `QuotaName`, `QuotaUsage`, and `QuotaState` are imported from `@repo/types`; the frontend does not redeclare them.

`useInvalidateQuotas()`, exported from the same file, calls `queryClient.invalidateQueries({ queryKey: ['billing', 'quotas', 'me'] })`. Consumers invoke it after mutations that the backend counts against a quota to immediately refresh the cached usage state.

`<QuotaGate>` in `apps/web/src/components/domain/billing/QuotaGate.tsx` calls `useQuota(name)` internally and selects one of three rendering branches, with `hard_exceeded` taking unconditional precedence over `soft_exceeded` and `normal`:

| `state` | Rendered output |
|---|---|
| `hard_exceeded` | `fallbackBlocked` prop, or default blocked message with upgrade CTA when applicable |
| `soft_exceeded` | `children` plus `fallbackWarning` prop, or `children` plus default warning banner with upgrade CTA when applicable |
| `normal` (including loading) | `children` only |

The upgrade CTA is resolved by composing `usePlans()` and `useMySubscription()`. The next plan is the first plan in the catalog (sorted by `price` ascending) whose `price` exceeds `currentPlan.price`. When no such plan exists — either because the user is already on the highest-priced plan or because the user's plan has been removed from the catalog with no higher-priced successor — the CTA is replaced with the informational message "You are on our highest plan — contact us for custom limits". No upgrade CTA is rendered at all when `state` is `'normal'`.
