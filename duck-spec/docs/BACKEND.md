# Backend

Living document describing backend conventions, patterns, and stack decisions for duck-stack.

---

## Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js |
| Framework | Fastify |
| Language | TypeScript (strict mode via `@repo/tsconfig`) |
| Module system | ESM (`NodeNext`) |
| Logger | Pino (Fastify built-in) + `pino-pretty` in development |
| Database client | `postgres.js` (singleton, direct TCP) |
| Security headers | `@fastify/helmet` |
| CORS | `@fastify/cors` |
| Dev runner | `tsx watch` |
| Build | `tsc` |

## App architecture

`apps/services` follows a **simplified hexagonal architecture with vertical slicing**. No DI container — constructor injection only.

| File | Responsibility |
|------|---------------|
| `src/app.ts` | `createApp()` — instantiates Fastify, registers shared plugins and feature modules. Does not call `listen`. |
| `src/server.ts` | Calls `createApp()`, reads `HOST`/`PORT`, calls `fastify.listen()`, handles `SIGINT`/`SIGTERM`. |

Feature modules live under `src/modules/<name>/` and expose a `routes.ts` Fastify plugin registered in `app.ts`. Shared infrastructure (logger, postgres.js database client) lives under `src/shared/infrastructure/`. Reusable plugins under `src/shared/plugins/`.

## Coding conventions

SOLID and Clean Code principles are hard expectations for every module — they govern design decisions, not just implementation polish.

**File naming.** Use camelCase starting with lowercase, with no dot-separated suffixes other than `.ts` and `.test.ts`, and no hyphens. DO: `completeOnboardingUseCase.ts`, `getUserProfileUseCase.ts`, `errorHandler.ts`, `clerkAuthPlugin.ts`, `checkoutDto.ts`, `userEntity.ts`. DO NOT: `completeOnboarding.use-case.ts`, `GetUserProfileUseCase.ts`, `error-handler.ts`, `clerk-auth.plugin.ts`, `checkout.dto.ts`, `user.entity.ts`. This convention is consistently enforced across all plugin, entity, and DTO files under `apps/services/src/`.

**Abstract names over concrete architecture names.** Names must describe the role, not the implementation technology.
- DO NOT: `UserSupabaseRepository`, `AuthSnsRepository`, `CreateClerkUserUseCase`.
- DO: `UserDBRepository`, `AuthEventRepository`, `CreateUserUseCase`.

This rule lets the underlying provider change without a rename cascade and keeps use cases dependent on roles, not vendors.

## Logging strategy

The static Pino logger exported from `shared/infrastructure/logger.ts` is the only shared logger instance in the application. There is no separate Fastify-bound logger for request code and no per-request child logger. Repositories, use cases, and webhook dispatchers all import and call this single instance directly.

| Context | Logger | Format |
|---------|--------|--------|
| HTTP requests | `shared/infrastructure/logger.ts` static Pino | `pino-pretty` in dev; JSON in production |
| Non-request code | `shared/infrastructure/logger.ts` static Pino | Same level and transport |

Every request gets a UUID via `genReqId`. `LOG_LEVEL` env var controls level (default `info`).

`requestId` is injected automatically into every log line emitted during an HTTP request via a Pino `mixin` backed by `AsyncLocalStorage`. A global `onRequest` hook in `app.ts` stores `{ requestId: request.id }` in the `AsyncLocalStorage` singleton exported from `shared/infrastructure/requestContext.ts`. The `mixin` on the static logger reads this store on every log call: when the store is set it merges `{ requestId }` into the output; when unset (server bootstrap, DB wiring, provider initialization) it returns `{}` and `requestId` is omitted. `AsyncLocalStorage` propagates the store through all async continuations of a request, guaranteeing correct `requestId` tagging across `await` chains, `setImmediate`, `setTimeout`, and DB driver callbacks. Concurrent requests are fully isolated — each `asyncLocalStorage.run` call creates an independent async context.

### Operational rules

- Use the static logger from `src/shared/infrastructure/logger.ts` everywhere — both inside and outside a request scope. Do not pass a logger by parameter to use cases, repositories, or dispatchers.
- Structured logging only. Stable field names: `timestamp`, `level`, `message`, `requestId`, `userId`, `duration`.
- Log: request in / response out at the boundary; external calls (DB, HTTP, queue) with their latency; business-significant state transitions; every error with its stack.
- Do NOT log: secrets, tokens, passwords, PII (GDPR/compliance); high-frequency trivial events inside tight loops; data already present in the request context.
- Include the IDs that make the entry reconstructable across services — e.g. `"Payment failed" { userId, orderId, reason }`.
- Use past tense for completed events (`"User created"`, `"Webhook processed"`).

## Domain error model

All domain errors extend `DomainError` from `shared/errors.ts`: `(code: string, message: string, statusCode: number, originalError?: unknown)`. The optional `originalError` is for internal logging only and is never serialized in HTTP responses. Built-in typed errors:

| Error class | Status | Code |
|-------------|--------|------|
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `ProviderError` | 502 or 400 | `PROVIDER_ERROR` |
| `EntitlementRequiredError` | 403 | `ENTITLEMENT_REQUIRED` |
| `QuotaExceededError` | 429 | `QUOTA_EXCEEDED` |
| `TrialExpiredError` | 403 | `TRIAL_EXPIRED` |
| `ProgrammingError` | 500 | `PROGRAMMING_ERROR` |

`ProviderError` is used exclusively by infrastructure adapters that call external payment/provider APIs. `statusCode 502` signals a transient or upstream failure (5xx responses, HTTP 401 from the provider, network errors, timeouts); `statusCode 400` signals a validation error reported by the provider itself.

`QuotaExceededError` carries structured quota fields (`quota`, `count`, `soft_limit`, `hard_limit`, `period_end`) in addition to the standard `code` and `message`. The `errorHandler` detects this subclass and serializes all five extra fields alongside `code` and `message` in the 429 response body.

`TrialExpiredError` carries `trialEndedAt` (the ISO timestamp when the trial expired) in addition to the standard `code` and `message`. The `errorHandler` detects this subclass and serializes `trialEndedAt` alongside `code` and `message` in the 403 response body. Both `QuotaExceededError` and `TrialExpiredError` are `DomainError` subclasses for which `errorHandler` emits a response body richer than `{ code, message }`.

`ProgrammingError` signals a developer mistake caught at runtime — such as calling `chargeQuota` without a preceding `requireQuota` for the same quota name, or calling `chargeQuota` on a `pre`-mode quota. It is a `DomainError` subclass with `statusCode 500` and always results in the standard `INTERNAL_ERROR` 500 response visible to the client; the real code is logged. It is never thrown for end-user-originated input (use `ValidationError` for those cases).

`shared/plugins/errorHandler.ts` intercepts every error: `DomainError` instances are serialized as `{ code, message }` at the error's `statusCode`; any other error is replied as a fixed `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` at status 500, with the real detail logged but never sent to the client. See the next section for the full propagation and logging contract.

## Error handling rules

### `try/catch` by layer

| Layer | Policy |
|-------|--------|
| Routes / handlers | None. Errors bubble to `errorHandler.ts`. |
| Use cases | Optional. The catch must end in one of the three outcomes below. |
| Repositories, adapters, provider clients | Required on every external call. Log the original error and re-throw a `DomainError` (typically `ProviderError`) with the cause on `originalError`. |
| Fire-and-forget async work | Forbidden without a wrapper that catches and logs. |

### Use case catch outcomes

1. **Log + re-throw** — default.
2. **Log + transform** — wrap in a different `DomainError` when it better describes the situation for the caller. Set `originalError`.
3. **Log + handle** — fallback, alternative source, or sentinel value. Only when the failure is non-critical (see Silent-fail below).

### Logging

- Log at every `catch`. Prefer duplicate logs over missing ones.
- `warn` for `DomainError` 4xx; `error` (with stack) for `DomainError` ≥ 500 and any non-`DomainError`.
- `errorHandler.ts` is the final log site — it logs every error before replying.

### `errorHandler` response contract

| Caught error | Body | Status |
|---|---|---|
| `DomainError` | `{ code, message }` from the instance | error's `statusCode` |
| Any other | `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` | 500 |

`originalError` is logged but never serialized in the response.

### Silent-fail exception

`return null` (or another sentinel) without re-throwing is permitted only when the failure is non-critical and the caller can proceed sensibly. Examples: cache miss → primary source; embedded analytics snippet → must not break the host page. Each site requires a code comment justifying the silent fail.

### Anti-patterns

- `try/catch` in a handler to call `reply.code(500)` — duplicates `errorHandler`.
- `catch (e) {}` or `return null` without a justifying comment.
- `throw new Error('failed')` — loses the stack and type. Wrap in a `DomainError` with `originalError`.
- Unawaited promises outside a wrapper that catches and logs.

## Security plugins

Registered globally in `app.ts`:
- `shared/plugins/cors.ts` — `CORS_ORIGIN` env var controls allowed origin (default `*` outside production)
- `shared/plugins/helmet.ts` — default `@fastify/helmet` options on every response

## Authentication plugin

`shared/plugins/clerkAuthPlugin.ts` is registered via `fastify-plugin` immediately after the security plugins so its `onRequest` hook fires on all routes. The plugin:

1. Reads `CLERK_SECRET_KEY` from `process.env` at registration time; throws if absent.
2. Creates a Clerk client via `@clerk/backend`'s `createClerkClient`, which fetches and caches Clerk's JWKS key set once. No Clerk API call occurs per request.
3. Registers a global `onRequest` hook that extracts the `Authorization: Bearer <token>` header, calls `verifyToken`, and decorates the request with `userId` and `orgId`.

`FastifyRequest` is augmented in `src/types/fastify.d.ts`:

| Property | Type |
|----------|------|
| `userId` | `string \| undefined` |
| `orgId` | `string \| null \| undefined` |

`userId` and `orgId` are `undefined` when no `Authorization` header is present or when verification fails. `orgId` is `null` when the JWT is valid but carries no organization claim.

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

## Feature module structure

Feature modules follow a **handler → useCase → IRepository → DBRepository** vertical slice. Each concern lives in its own file; no business logic is placed directly in route handlers.

| Subdirectory | Responsibility |
|---|---|
| `entities/` | Plain TypeScript interfaces mirroring database rows; no methods or runtime dependencies |
| `repositories/interfaces/` | Repository interface (`IFooRepository`) declaring typed methods; no SQL |
| `repositories/` | `FooDBRepository` implementing the interface using the `postgres.js` singleton |
| `dtos/` | Zod schemas for request body and query validation |
| `useCases/` | One class per endpoint; receives an `IFooRepository` via constructor; contains all business logic |
| `handlers/` | Thin Fastify handler functions; validate input with Zod, instantiate the use case, call `execute`, reply |
| `routes.ts` | Fastify plugin that registers all routes for the module with their `preHandler` arrays |

### Layer rules

- **One handler per feature.** Handlers only instantiate repositories and inject them into the use case. No business logic. Create the use case at module scope (outside the handler function), in the same file.
- **One use case per feature.** Use cases contain pure business logic with no framework or concrete service dependencies. They only consume repositories — **a use case never consumes another use case** under any circumstance.
- **One repository per entity per data source.** `usersRepository.ts`, `usersCacheRepository.ts`, `usersEventsRepository.ts` are separate repositories because they target different data sources for the same entity. Mixing two entities in one repository (e.g. transactions + refunds) is a SRP violation — split them.
- **Shared repositories live in `src/shared/repositories/`** when two or more modules depend on the same repository.
- **Use cases depend on interfaces, never on implementations.** Handlers do the wiring (`new FooDBRepository(db)`) and pass the instance to the use case constructor typed as `IFooRepository`.

### Repository interface pattern

Repository interfaces (`IFooRepository`) define only the data-access contract. Implementations (`FooDBRepository`) are instantiated directly in handlers — no DI container is used. This keeps use cases testable by substituting a fake repository without a real database.

### Cursor-based pagination

Listing endpoints that may return large result sets use cursor-based pagination rather than offset pagination. The cursor encodes a `(created_at, id)` pair as base64. The repository queries with `(created_at, id) < (cursor_created_at, cursor_id) ORDER BY created_at DESC, id DESC LIMIT limit + 1`; if `limit + 1` rows are returned the extra row's pair is encoded as the `nextCursor`; otherwise `nextCursor` is `null`. Malformed or expired cursors return HTTP 400 with code `VALIDATION_ERROR`.

## Webhook modules

Webhook endpoints are feature modules, not shared plugins. Each provider's webhook handler lives under `src/modules/webhooks/<provider>/` and is registered in `app.ts` as a scoped Fastify plugin.

**Raw body requirement.** Webhook signature verification libraries (e.g. Svix) require the unmodified request bytes. Because Fastify v4 does not support a global `rawBody` option, webhook plugins register a scoped `addContentTypeParser('application/json', { parseAs: 'buffer' }, ...)` override. This causes `request.body` to arrive as a `Buffer` inside the plugin's route context only — other routes are unaffected.

**Registration order.** Webhook plugins must be registered in `app.ts` before `clerkAuthPlugin` so the global `onRequest` auth hook does not attempt JWT verification on routes that carry no `Authorization` header by design.

**Fail-fast secret check.** Each webhook plugin reads its signing secret from `process.env` at registration time and throws `Error` immediately if the variable is absent. This prevents the route from ever being served without signature verification.

**Repository pattern.** All database calls within a webhook module are centralized in a `<Provider>SyncRepository` class. Handler functions receive a repository instance via constructor injection and call typed methods (`upsertUser`, `upsertOrganization`, `createMembership`, etc.). This keeps SQL logic testable in isolation and out of handler/dispatcher code.

**Atomic multi-step repository operations.** When a single business action requires multiple writes that must be observed atomically (e.g., upserting a child record and conditionally updating a parent record's status), the repository method wraps all writes in a `sql.begin(async (tx) => { ... })` block provided by `postgres.js`. The method returns a typed result struct (outcome + resolved IDs) so the caller never needs to re-query. Dispatchers and use cases receive only the outcome value — no SQL or transaction coordination logic leaks outside the repository implementation.

## Tests

Unit tests live under `apps/services/tests/unit/` using Jest. Interface mocks live in `apps/services/tests/mocks/`.

**Test paths mirror the file under test.** A file at `src/modules/billing/providers/mobbexProvider.ts` is tested at `tests/unit/modules/billing/providers/mobbexProvider.test.ts`. This mirroring is mandatory — it makes test ownership and coverage gaps trivially auditable.

## Configuration

**No `process.env` reads outside config files.** Application code must import a typed config object instead of reading environment variables directly. This isolates env-var coupling to a single layer and makes config defaults discoverable.

**Config files live in `src/shared/configs/<scope>Config.ts`.** One file per logical scope. Established scopes:

| File | Variables covered |
|------|-------------------|
| `serverConfig.ts` | `NODE_ENV`, `LOG_LEVEL`, `HOST`, `PORT`, `CORS_ORIGIN` |
| `authConfig.ts` | `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` |
| `mobbexConfig.ts` | `BILLING_PROVIDER`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_TEST_MODE`, `MOBBEX_TIMEOUT_MS`, `MOBBEX_WEBHOOK_SECRET` |
| `subscriptionsConfig.ts` | `STRICT_ENTITLEMENTS_ON_PAST_DUE` |
| `dbConfig.ts` | (database connection — see Database client section) |

Use this shape:

```ts
const env = process.env || {};

export const serviceConfig = {
    env: env.NODE_ENV,
    shortEnv: env.SHORT_ENV,
    selfUrl: env.SELF_URL || 'https://url.example.com/api'
};
```

The only places allowed to read `process.env` directly are these config files and the small number of bootstrap files documented elsewhere in this doc (e.g. `shared/infrastructure/db.ts` for `DATABASE_URL`, `clerkAuthPlugin` for `CLERK_SECRET_KEY`). Any new env-var dependency must go through a config file.

## Comments

Keep comments small. Add a comment when it explains the domain reasoning or a non-obvious technical decision (a hidden constraint, a workaround for a specific provider quirk, an invariant that would surprise a reader). Do not narrate what the code does — well-named identifiers cover that.

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc` |
| `lint` | `eslint src` |
