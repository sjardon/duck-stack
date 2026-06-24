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

| Context | Instance | Format |
|---------|----------|--------|
| HTTP requests | Fastify built-in logger | `pino-pretty` in dev; JSON in production |
| Non-request code | `shared/infrastructure/logger.ts` standalone pino | Same level and transport |

Every request gets a UUID via `genReqId`. `LOG_LEVEL` env var controls level (default `info`).

### Logger propagation pattern

The request-bound logger is threaded explicitly through the call stack using an explicit per-call parameter. This is the enforced pattern across all modules:

| Layer | How the logger is supplied |
|-------|---------------------------|
| Handler | Reads `request.log` from the Fastify request object |
| Use case `execute` | Accepts `logger: pino.BaseLogger` as a parameter; receives `request.log` from the handler |
| Repository method | Accepts `logger: pino.BaseLogger` as a parameter; receives the logger forwarded by the use case |
| Webhook dispatcher (`dispatchMobbexEvent`, `dispatchClerkEvent`) | Accepts `logger: pino.BaseLogger` as a parameter; receives `request.log` from the route handler |

Repository files do not import the static logger. The static logger from `shared/infrastructure/logger.ts` is passed by callers that run outside the request scope (server bootstrap, `db.ts`, `resolveProvider.ts`). Using `pino.BaseLogger` as the parameter type keeps use cases and repositories free of Fastify-specific types.

### Operational rules

- Use the logger from `src/shared/infrastructure/logger.ts` outside the request scope; inside a request always pass `request.log` down through the use case and into the repository — never import the static logger from within a repository or use case file that executes during a request.
- Structured logging only. Stable field names: `timestamp`, `level`, `message`, `requestId`, `userId`, `duration`.
- Log: request in / response out at the boundary; external calls (DB, HTTP, queue) with their latency; business-significant state transitions; every error with its stack.
- Do NOT log: secrets, tokens, passwords, PII (GDPR/compliance); high-frequency trivial events inside tight loops; data already present in the request context.
- Include the IDs that make the entry reconstructable across services — e.g. `"Payment failed" { userId, orderId, reason }`.
- Use past tense for completed events (`"User created"`, `"Webhook processed"`).

## Domain error model

All domain errors extend `DomainError` from `shared/errors.ts`: `(code: string, message: string, statusCode: number)`. Built-in typed errors:

| Error class | Status | Code |
|-------------|--------|------|
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `ProviderError` | 502 or 400 | `PROVIDER_ERROR` |

`ProviderError` is used exclusively by infrastructure adapters that call external payment/provider APIs. `statusCode 502` signals a transient or upstream failure (5xx responses, HTTP 401 from the provider, network errors, timeouts); `statusCode 400` signals a validation error reported by the provider itself.

`shared/plugins/errorHandler.ts` intercepts `DomainError` and replies `{ code, message }` at the error's `statusCode`. Unknown errors fall through to Fastify's default handler.

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

This pattern is established by the `billing` module (BILLING-002) and mirrors the `users` module structure. New feature modules must follow the same layout.

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
