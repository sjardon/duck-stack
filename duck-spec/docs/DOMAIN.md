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
