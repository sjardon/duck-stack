# SUBS-006 — Plan Usage Quotas (backend)

## Reason for being

SUBS-005 introduced boolean entitlements per plan (feature gates), but the product also needs numeric usage limits (e.g. "100 requests per month on the free plan"). Without these limits the backend cannot enforce plan-bound consumption and the frontend has no way to surface warnings as a user approaches a cap.

This feature adds the backend infrastructure to count consumption per scope against the active plan's thresholds, block requests when the hard limit is exceeded, and expose current usage so the frontend (in a follow-up feature) can render warnings and gates.

## Scope

Defines a backend-owned, code-level mapping from `plan.code` to named numeric quotas (`soft_limit`, `hard_limit`), persists per-scope counters in a new `usage_counters` Supabase table, and provides the runtime primitives that operate on them: a `requireQuota(name)` Fastify preHandler factory that atomically increments and enforces the hard limit, a lazy `free` subscription created on demand, and a `GET /billing/quotas/me` endpoint that returns resolved usage with a derived state. Periods follow the active subscription's billing period and rotate naturally as that period rolls over.

## Out of scope

- Frontend hook and component to consume `GET /billing/quotas/me` (covered in SUBS-007).
- Trials and fixed-duration plans.
- Admin-side manual override of thresholds per user.
- Cron / cleanup job for historical `usage_counters` rows.
- Decrementing the counter (no usage "refunds").
- Sliding-window quotas (e.g. "100 per hour"); only the subscription period is supported.
- Email notifications when `soft_limit` or `hard_limit` is reached.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall define a mapping from `plan.code` to `Record<string, { soft_limit: number, hard_limit: number }>` in backend code (not in the database) in `apps/services/src/modules/subscriptions/entitlements.ts`, alongside the SUBS-005 entitlements mapping. |
| R002 | Ubiquitous | The system shall persist per-scope quota usage in a Supabase table `usage_counters` with columns `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `quota_name` (text), `period_start` (timestamptz), `count` (integer, default 0), `created_at`, `updated_at`, a unique constraint on `(user_id, org_id, quota_name, period_start)`, and a check constraint requiring at least one of `user_id` or `org_id` to be non-null. |
| R003 | Event-driven | WHEN a request reaches a handler protected by `requireQuota(name)`, the system shall resolve the authenticated scope, obtain or lazily create the active subscription, read the active subscription's `current_period_start` and the plan's thresholds for `name`, and atomically upsert the counter with `INSERT … ON CONFLICT (user_id, org_id, quota_name, period_start) DO UPDATE SET count = usage_counters.count + 1, updated_at = now() RETURNING count`. |
| R004 | Conditional | IF the returned `count` from the upsert is greater than the plan's `hard_limit` for `name`, THEN the system shall respond with HTTP 429, domain error code `QUOTA_EXCEEDED`, and body `{ quota: name, count, soft_limit, hard_limit, period_end }`. |
| R005 | Conditional | IF the returned `count` from the upsert is less than or equal to the plan's `hard_limit` for `name`, THEN the system shall allow the request to proceed to the route handler. |
| R006 | Conditional | IF the active plan does not define the quota named `name`, THEN the system shall treat it as unlimited, skip the upsert, and allow the request to proceed to the route handler. |
| R007 | Event-driven | WHEN `requireQuota` runs and the authenticated scope has no active subscription, the system shall lazily create a synthetic `free` subscription with `status = 'active'`, `current_period_start = date_trunc('month', now())`, and `current_period_end = current_period_start + 1 month` before performing the upsert. |
| R008 | Event-driven | WHEN `GET /billing/quotas/me` receives an authenticated request, the system shall return `{ quotas: Array<{ name, count, soft_limit, hard_limit, period_start, period_end, state }> }` covering every quota defined for the scope's active plan. |
| R009 | Ubiquitous | The system shall derive the `state` field of each quota in `GET /billing/quotas/me` as `hard_exceeded` when `count > hard_limit`, `soft_exceeded` when `count > soft_limit` (and not hard-exceeded), and `normal` otherwise. |
| R010 | Ubiquitous | The system shall protect `GET /billing/quotas/me` with the `requireAuth` preHandler and reject unauthenticated requests with HTTP 401. |
| R011 | Event-driven | WHEN the active subscription's `current_period_start` changes (rollover from SUBS-003 webhook or the lazy free subscription transitioning to a new month), the system shall create a new `usage_counters` row on the next `requireQuota` invocation by virtue of the unique constraint not matching, preserving previous rows as historical records. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The system shall guarantee that the counter upsert is atomic under concurrent requests from the same scope; two simultaneous requests shall never lose an increment, enforced by the `(user_id, org_id, quota_name, period_start)` unique constraint combined with `ON CONFLICT DO UPDATE`. |
| NF002 | The `requireQuota` preHandler shall add less than 20 ms p95 to the request handler. |
| NF003 | `GET /billing/quotas/me` shall respond in under 200 ms p95. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the active subscription has status `past_due`, the system shall evaluate quotas against the active plan's thresholds (mirroring SUBS-005 with `STRICT_ENTITLEMENTS_ON_PAST_DUE = false`). |
| EC002 | WHEN the active subscription has status `canceled` and `current_period_end > now()`, the system shall keep evaluating quotas against the cancelled subscription's plan thresholds until `current_period_end` elapses. |
| EC003 | WHEN a user downgrades to a plan whose `hard_limit` for a quota is lower than the user's current `count` in the active period, the system shall return HTTP 429 with code `QUOTA_EXCEEDED` on every subsequent `requireQuota(name)` invocation until the next period rolls over and produces a new `usage_counters` row. |
| EC004 | WHEN the active plan does not define the requested quota name, the system shall not insert a row in `usage_counters` and shall allow the request to proceed (unlimited usage for that plan). |
| EC005 | WHEN the authenticated request context carries both `user_id` and `org_id`, the system shall record the counter against `org_id` (with `user_id = NULL`) so the organization owns the consumption. |
| EC006 | WHEN a synthetic `free` subscription was created lazily for a scope and the user later activates a paid subscription, the system shall leave the free row as historical and route subsequent `requireQuota` calls through the new paid subscription, since it is the active non-terminal one. |
| EC007 | WHEN two concurrent requests for the same scope (no prior subscription) both attempt to lazy-create the synthetic `free` subscription, the system shall let the partial unique index on `subscriptions` (from SUBS-002) reject the second insert and the preHandler shall recover by re-reading the now-existing active subscription. |

## Technical constraints

- Backend implementation extends `apps/services/src/modules/subscriptions/` following the handler → useCase → IRepository → DBRepository vertical-slice pattern documented in `duck-spec/docs/BACKEND.md`.
- A Supabase migration creates the `usage_counters` table with indexes on `(user_id, quota_name, period_start)` and `(org_id, quota_name, period_start)` in addition to the unique constraint.
- The atomic upsert runs via tagged-template SQL through the `postgres.js` singleton; no ORM, query builder, or `@supabase/supabase-js` runtime dependency.
- The lazy `free` subscription is encapsulated in a reusable helper `ensureActiveSubscription(scope)` in the subscriptions module.
- Shared types `QuotaName` (string-literal union), `QuotaThresholds`, `QuotaUsage`, and `QuotaState` are exported from `@repo/types` so the frontend (SUBS-007) consumes the same types as the backend.
- The plan → quotas mapping is the single source of truth in the backend; the frontend only reads `GET /billing/quotas/me` and never recomputes thresholds locally.

## Dependencies

- SUBS-005 — pattern for the plan → config code-level mapping and active-plan resolution.
- SUBS-002 — `subscriptions` table with `current_period_start` and partial unique indexes enforcing a single active subscription per scope.
- SUBS-001 — `subscription_plans.code` values used as the keys of the plan → quotas mapping.
- AUTH-001 — `requireAuth` preHandler and the `userId` / `orgId` request context.

## Effort

**high** — 11 functional requirements, 3 NFRs including atomicity and latency targets, 7 edge cases including a concurrency race, a new Supabase table with migration, atomic upsert pattern, lazy subscription creation, and dependencies on SUBS-005, SUBS-002, SUBS-001, and AUTH-001.
