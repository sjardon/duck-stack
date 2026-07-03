# Domain

Living document describing the shared domain model for duck-stack. Covers entities, value objects, and cross-module contracts defined in `@repo/types`. Updated when a feature introduces or changes a domain-level interface.

---

## `UserProfile`

Shared interface exported from `packages/types/src/index.ts`. Consumed by both `apps/services` (as the return type of user repository methods and endpoint responses) and `apps/web` (as the type for React Query cache data and component props).

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `name` | `string` | no | Display name synced from Clerk via webhook |
| `email` | `string` | no | Primary email synced from Clerk via webhook |
| `avatar_url` | `string` | yes | Avatar URL synced from Clerk; `null` when not set |
| `locale` | `string` | yes | User-editable locale preference; `null` until set |
| `timezone` | `string` | yes | User-editable timezone preference; `null` until set |
| `job_role` | `string` | yes | Segmentation field captured at onboarding; `null` until onboarding is completed |
| `company_size` | `string` | yes | Segmentation field captured at onboarding; `null` until onboarding is completed |
| `primary_use_case` | `string` | yes | Segmentation field captured at onboarding; `null` until onboarding is completed |
| `onboarding_completed` | `boolean` | no | `false` on account creation; set to `true` atomically by `POST /users/me/onboarding` |

`onboarding_completed` is the authoritative gate for the onboarding redirect in `AuthGuard`. The three segmentation fields are not validated against canonical enumerations — any non-empty string is accepted.

`UserProfile` has no runtime dependencies. It is a pure TypeScript interface with no class implementation.

---

## `SubscriptionPlan`

Shared interface exported from `packages/types/src/index.ts`. Consumed by `apps/services` (as the return type of `ISubscriptionPlanRepository.listActive()` and the `GET /billing/plans` response) and by any frontend consumer that renders the plans catalog.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `string` | no | UUID primary key |
| `code` | `string` | no | Unique short identifier (e.g. `free`, `pro`, `business`) |
| `name` | `string` | no | Human-readable display name |
| `description` | `string` | no | Short marketing description |
| `price` | `number` | no | Numeric price; `0` for the free plan. Stored as `NUMERIC` in the DB; returned as a JS `number` |
| `currency` | `string` | no | ISO currency code (e.g. `USD`) |
| `interval` | `'month' \| 'year'` | no | Billing interval; constrained to these two values at the DB level |
| `features` | `string[]` | no | Flat array of human-readable feature strings; no nested objects |
| `is_active` | `boolean` | no | When `false` the plan is excluded from the public catalog but existing subscriptions are preserved |
| `provider_plan_id` | `string \| null` | yes | Opaque identifier of the counterpart plan in the external payment provider; `null` when no provider-side plan is linked |
| `created_at` | `string` | no | ISO 8601 timestamp |
| `updated_at` | `string` | no | ISO 8601 timestamp |

`SubscriptionPlan` has no runtime dependencies. It is a pure TypeScript interface with no class implementation.

---

## `EntitlementName`

String-literal union exported from `packages/types/src/index.ts`. Consumed by `apps/services` (as the element type of `PLAN_ENTITLEMENTS` values and `request.entitlements`) and by `apps/web` (as the argument type for `useEntitlement` and `<EntitlementGate>`).

Defined members: `'advanced_analytics'`, `'priority_support'`, `'api_access'`, `'team_collaboration'`, `'white_label'`.

`EntitlementName` is the authoritative type for entitlement identity across the stack. The backend never materializes entitlement names from the database — they are declared in code as members of this union. Adding a new entitlement requires updating both this type and the `PLAN_ENTITLEMENTS` mapping in `subscriptions/entitlements.ts`. `components/ui/` components must not reference `EntitlementName` directly; only `components/domain/` and hooks may import it.

---

## `QuotaMode`

Type alias exported from `packages/types/src/index.ts`: `'pre' | 'post'`.

- `'pre'` — the cost of an operation is computable from the incoming request before the handler executes.
- `'post'` — the cost is only knowable after the handler executes; the quota system reserves a worst-case amount upfront and reconciles afterward via `chargeQuota`.

---

## `QuotaUnit`

Type alias exported from `packages/types/src/index.ts`: `string`. Representative values include `'request'`, `'token'`, `'byte'`, and `'recipient'`. The unit is intrinsic to the quota strategy, not to the plan. It is surfaced to callers via the `unit` field on `QuotaUsage` so that clients can display consumption in meaningful units.

---

## `QuotaStrategy`

Interface exported from `packages/types/src/index.ts`. Defines how a quota's consumption is measured.

| Field | Type | Description |
|-------|------|-------------|
| `unit` | `QuotaUnit` | The unit of measurement for this quota's counter |
| `mode` | `QuotaMode` | Whether cost is determined before (`pre`) or after (`post`) the handler executes |
| `compute` | `(req: unknown) => number` | Returns the cost (pre mode) or worst-case reservation (post mode) for the given request. Typed as `unknown` in `@repo/types` because the package has no Fastify dependency; cast to `FastifyRequest` at the call site in `entitlements.ts` |

Strategies are declared in the `QUOTA_STRATEGIES` registry in `apps/services/src/modules/subscriptions/entitlements.ts` alongside the `PLAN_QUOTAS` thresholds mapping. The `QuotaName` union from SUBS-006 acts as the mandatory key set so every known quota has an explicit strategy. Unregistered quota names fall back to `DEFAULT_QUOTA_STRATEGY` (`unit: 'request', mode: 'pre', compute: () => 1`).

`QuotaStrategy` has no runtime dependencies. It is a pure TypeScript interface with no class implementation.

---

## `QuotaUsage`

Interface exported from `packages/types/src/index.ts`. Returned by `GET /billing/quotas/me` for each quota on the scope's active plan. Extended by SUBS-010 to include `unit`.

| Field | Type | Description |
|-------|------|-------------|
| `quota_name` | `string` | The quota identifier |
| `unit` | `QuotaUnit` | The unit of measurement, read from the quota's `QuotaStrategy` |
| `count` | `number` | Current persisted consumption for the billing period |
| `soft_limit` | `number` | Advisory threshold; crossing it transitions state to `soft_exceeded` |
| `hard_limit` | `number` | Enforcement threshold; crossing it causes `requireQuota` to return HTTP 429 |
| `period_start` | `string` | ISO 8601 timestamp marking the start of the current billing period |
| `period_end` | `string` | ISO 8601 timestamp marking the end of the current billing period |
| `state` | `'normal' \| 'soft_exceeded' \| 'hard_exceeded'` | Derived from `count` vs. the two thresholds |
