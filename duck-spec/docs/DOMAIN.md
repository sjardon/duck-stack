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
