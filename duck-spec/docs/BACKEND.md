# Backend

This file now holds only the deep-dive, on-demand sections (auth/Clerk internals, database query rules, pagination, webhook handling); core conventions that apply to all backend work moved to `apps/services/CLAUDE.md`.

---

## Authentication plugin

`shared/plugins/clerkAuthPlugin.ts` is registered via `fastify-plugin` immediately after the security plugins so its `onRequest` hook fires on all routes. The plugin:

1. Reads `CLERK_SECRET_KEY` from `process.env` at registration time; throws if absent.
2. Creates a Clerk client via `@clerk/backend`'s `createClerkClient`, which fetches and caches Clerk's JWKS key set once. No Clerk API call occurs per request for JWT verification.
3. Registers a global `onRequest` hook that extracts the `Authorization: Bearer <token>` header, calls `verifyToken`, and — on success — decorates the request with `clerkUserId`/`clerkOrgId` (the raw Clerk IDs) and `userId`/`orgId` (the internal `users.id`/`organizations.id` UUIDs, resolved via `resolveIdentityClaim`).

`FastifyRequest` is augmented in `src/types/fastify.d.ts`:

| Property | Type |
|----------|------|
| `clerkUserId` | `string \| undefined` |
| `clerkOrgId` | `string \| null \| undefined` |
| `userId` | `string \| undefined` |
| `orgId` | `string \| null \| undefined` |

All four are `undefined` when no `Authorization` header is present or when verification fails; `clerkOrgId`/`orgId` are `null` when the JWT is valid but carries no organization claim.

### Internal-identity claim resolution

`userId`/`orgId` are **not** the Clerk IDs — they are the internal UUIDs (`users.id`/`organizations.id`), because most feature modules (`subscriptions`, `billing`, `usage_counters`) treat these request properties as opaque values written directly into FK columns. `clerkUserId`/`clerkOrgId` remain available on the request for the few consumers (the `users` module) that key on `clerk_user_id`/`clerk_org_id` instead.

`shared/plugins/resolveIdentityClaim.ts` implements the resolution:

1. **Fast path.** If the JWT carries a custom `app_user_id`/`app_org_id` claim (sourced from `private_metadata.appUserId`/`appOrgId`), that value is used directly — no DB call, no added latency.
2. **Degraded path.** If the claim is absent, the plugin retries a DB lookup by `clerk_user_id`/`clerk_org_id` with exponential backoff (starting at 100ms, doubling, capped to the remaining budget) for up to a 2-second total budget. On success, the request proceeds and a fire-and-forget write pushes the resolved UUID back into Clerk `private_metadata` (failures logged at `warn`, non-critical because the webhook-side write below is the primary path). On budget exhaustion the plugin throws `ServiceUnavailableError`, replied by `errorHandler` as HTTP 503 with `Retry-After`.

The `user.created`/`organization.created` handlers in `src/modules/webhooks/clerk/` perform the primary, blocking half of this reliability strategy: they write the internal UUID into Clerk `private_metadata` synchronously, right after the DB upsert; a failed write propagates as a thrown `ProviderError` so the webhook responds non-2xx and Clerk retries the event. The plugin's lazy backfill (above) is the self-healing fallback for identities created before this mechanism existed, or for requests that race an in-flight webhook retry.

## Route-level auth preHandlers

Two reusable preHandler functions live in `src/shared/plugins/`:

| Export | File | Behavior |
|--------|------|----------|
| `requireAuth` | `requireAuth.ts` | Throws `UnauthorizedError` (401) when `request.userId` is `undefined` |
| `requireOrg` | `requireOrg.ts` | Calls `requireAuth`, then throws `ForbiddenError` (403) when `request.orgId` is `null` |

Neither preHandler is registered globally. Routes opt in by listing the relevant function in their `preHandler` array. Organization-scoped enforcement is a per-route decision — the starter does not impose it globally.

### Entitlement preHandler

`requireEntitlement(name: EntitlementName)` in `apps/services/src/modules/subscriptions/plugins/requireEntitlement.ts` is a **preHandler factory**: it accepts an entitlement name and returns a Fastify `preHandler` function. This pattern is distinct from `requireAuth`/`requireOrg` (plain functions) because the behavior is parameterized per route.

Module-scope instances of `GetEntitlementsUseCase` and `SubscriptionDBRepository` are created once at plugin load time. On first invocation within a request the resolved array is written to `request.entitlements` (`FastifyRequest` augmentation declared in the same file); subsequent `requireEntitlement` calls in the same request skip the database. When the required entitlement is absent the factory-returned handler throws `EntitlementRequiredError` (HTTP 403, code `ENTITLEMENT_REQUIRED`). `request.entitlements` augmentation is declared in the same file as the factory, collocating the type extension with the only code that writes it.

### Quota preHandler

`requireQuota(name: string)` in `apps/services/src/modules/subscriptions/plugins/requireQuota.ts` is a **preHandler factory** that enforces numeric usage limits per billing period. It accepts a quota name and returns a Fastify `preHandler` function. Module-scope singletons (`SubscriptionDBRepository`, `UsageCounterDBRepository`, `RequireQuotaUseCase`) are instantiated once at plugin load time. The plugin also registers `fastify.decorateRequest('quotaReservations', null)` once at load time to support `post`-mode quota strategies (see below).

The returned preHandler resolves the effective scope (if `request.orgId` is set, the organization owns the counter; otherwise the user does) and delegates to `RequireQuotaUseCase`. The use case resolves the quota's `QuotaStrategy` from the `QUOTA_STRATEGIES` registry in `entitlements.ts` (falling back to `DEFAULT_QUOTA_STRATEGY` for unregistered quotas), calls `strategy.compute(request)` to determine the cost, validates the result (must be a non-negative integer), then calls `ensureActiveSubscription` and looks up the plan's threshold from the `PLAN_QUOTAS` mapping. It issues a single atomic `INSERT … ON CONFLICT (user_id, org_id, quota_name, period_start) DO UPDATE SET count = usage_counters.count + $cost RETURNING count` via `incrementByAndReturn`. If the returned count exceeds `hard_limit` the use case throws `QuotaExceededError`; if the plan does not define the quota name the use case returns without touching the database (unlimited); if `compute` returns `0` the upsert is skipped entirely. Period rollover is natural: a new `current_period_start` does not match the existing unique-constraint key, causing the upsert to insert a fresh row.

When the strategy `mode` is `post`, `RequireQuotaUseCase` additionally decorates `request.quotaReservations[name] = { reserved, charged, rowKey }` after the upsert. Handlers for `post`-mode quotas must call the exported `chargeQuota(request, name, actual)` helper to reconcile the final cost. `chargeQuota` delegates to `ChargeQuotaUseCase` (`apps/services/src/modules/subscriptions/useCases/chargeQuotaUseCase.ts`), which computes `delta = actual - charged` and issues a single atomic `UPDATE usage_counters SET count = count + $delta` via `adjustCount` on the repository — no prior read. If `chargeQuota` is never called, the initial reservation persists as the worst-case final cost. `chargeQuota` throws `ProgrammingError` (HTTP 500, code `PROGRAMMING_ERROR`) when called without a preceding `requireQuota` for the same quota name or when called for a `pre`-mode quota. The `FastifyRequest` module augmentation for `quotaReservations` is declared in `requireQuota.ts`, collocating the type extension with the code that writes it.

`ensureActiveSubscription` in `apps/services/src/modules/subscriptions/helpers/ensureActiveSubscription.ts` is a plain async helper (not a use case) shared between `RequireQuotaUseCase` and `GetMyQuotasUseCase`. Its behavior is mode-aware: when `subscriptionsConfig.signupMode === 'freemium'` and `findActiveOrWithinPeriodByScope` returns null, it inserts a synthetic subscription with `plan_code = 'free'`, `status = 'active'`, and `current_period_start = date_trunc('month', now())`; a unique-constraint violation on the concurrent insert is caught and resolved by re-reading the now-existing row. When `signupMode === 'free_trial'` and no subscription is found, it returns `null` without creating any row. Callers must handle the `null` case, treating it as plan-less (no quotas enforced, no usage reported).

### Active subscription preHandler

`requireActiveSubscription` in `apps/services/src/modules/subscriptions/plugins/requireActiveSubscription.ts` is a **plain preHandler function** (not a factory — no parameter) registered as a global `onRequest` hook in `app.ts` after `clerkAuthPlugin`. It is a no-op when `subscriptionsConfig.signupMode === 'freemium'`. In `free_trial` mode it calls `transitionExpiredTrials` to lazily flip any expired trial, then checks for a non-expired subscription (`active`, `trialing`, `pending`, or `past_due`); if none exists it throws `TrialExpiredError` (HTTP 403, code `TRIAL_EXPIRED`, body `{ trialEndedAt }`). The hook is excluded for paths matching `/billing/*`, `/webhooks/*`, and `/health`. This is distinct from `requireEntitlement` and `requireQuota` (per-route factories) — `requireActiveSubscription` is applied globally once in `app.ts` and carries no parameters.

## Database client

`shared/infrastructure/db.ts` exports a `postgres.js` `Sql` singleton created from `DATABASE_URL`. Throws a descriptive error synchronously at module load time if `DATABASE_URL` is absent or empty, preventing the server from starting. Repositories import this singleton directly and execute all queries as tagged-template SQL calls over a direct TCP connection to Postgres. `@supabase/supabase-js` is not a runtime dependency of `apps/services`.

### Query rules

- **Raw SQL only.** Use `postgres.js` tagged-template queries directly. No ORMs, query builders, or other SQL abstraction libraries.
- **Always parameterized.** Use tagged template literals — never interpolate values directly into SQL strings (SQL injection).
- **No `SELECT *`.** Select only the columns the caller needs to reduce payload and avoid schema drift leaking unexpected fields.
- **Validate before querying.** Sanitize and validate all external input at the boundary (Zod DTOs) before it reaches a query.
- **Multi-step writes in transactions.** Any sequence of writes that must succeed or fail together must use `sql.begin(async (tx) => { ... })`.
- **Queries only in repositories.** No raw SQL in use cases, handlers, dispatchers, or routes — only in repository files.
- **Always paginate unbounded queries.** Apply cursor-based pagination (see below) or `LIMIT` to any query that may return more than a single row.
- **Log query latency.** Track duration at the repository layer for every external DB call.
- **Enforce constraints at the DB level.** Use `NOT NULL`, `UNIQUE`, `CHECK`, and `FK` constraints — do not rely solely on app-level validation.
- **Migrations are separate.** Schema changes belong in versioned migration files, never in application startup code.

## Pagination

Listing endpoints that may return large result sets use cursor-based pagination rather than offset pagination. The cursor encodes a `(created_at, id)` pair as base64. The repository queries with `(created_at, id) < (cursor_created_at, cursor_id) ORDER BY created_at DESC, id DESC LIMIT limit + 1`; if `limit + 1` rows are returned the extra row's pair is encoded as the `nextCursor`; otherwise `nextCursor` is `null`. Malformed or expired cursors return HTTP 400 with code `VALIDATION_ERROR`.

## Webhook modules

Webhook endpoints are feature modules, not shared plugins. Each provider's webhook handler lives under `src/modules/webhooks/<provider>/` and is registered in `app.ts` as a scoped Fastify plugin.

**Raw body requirement.** Webhook signature verification libraries (e.g. Svix) require the unmodified request bytes. Because Fastify v4 does not support a global `rawBody` option, webhook plugins register a scoped `addContentTypeParser('application/json', { parseAs: 'buffer' }, ...)` override. This causes `request.body` to arrive as a `Buffer` inside the plugin's route context only — other routes are unaffected.

**Registration order.** Webhook plugins must be registered in `app.ts` before `clerkAuthPlugin` so the global `onRequest` auth hook does not attempt JWT verification on routes that carry no `Authorization` header by design.

**Fail-fast secret check.** Each webhook plugin reads its signing secret from `process.env` at registration time and throws `Error` immediately if the variable is absent. This prevents the route from ever being served without signature verification.

**Repository pattern.** All database calls within a webhook module are centralized in a `<Provider>SyncRepository` class. Handler functions receive a repository instance via constructor injection and call typed methods (`upsertUser`, `upsertOrganization`, `createMembership`, etc.). This keeps SQL logic testable in isolation and out of handler/dispatcher code.

**Atomic multi-step repository operations.** When a single business action requires multiple writes that must be observed atomically (e.g., upserting a child record and conditionally updating a parent record's status), the repository method wraps all writes in a `sql.begin(async (tx) => { ... })` block provided by `postgres.js`. The method returns a typed result struct (outcome + resolved IDs) so the caller never needs to re-query. Dispatchers and use cases receive only the outcome value — no SQL or transaction coordination logic leaks outside the repository implementation.

