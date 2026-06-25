# services — Functional Spec

Living document describing the current functional state of the `apps/services` Fastify backend. Updated after each implemented feature.

---

## Base structure (SERVICES-001)

### App bootstrap

The `services` app is structured around a simplified hexagonal architecture with vertical slicing. The entry point (`server.ts`) calls `createApp()`, reads `HOST` (default `0.0.0.0`) and `PORT` (default `3000`) from environment variables, and starts the Fastify server. On `SIGINT` or `SIGTERM`, the server performs a graceful shutdown via `fastify.close()`, exiting with code `0` on success and `1` on error.

`app.ts` acts as the Fastify instance factory: it instantiates Fastify, registers all shared plugins (error handler, CORS, Helmet), and registers all feature modules (currently `health`). It does not call `listen` — that responsibility belongs to `server.ts`.

### Directory layout

```
apps/services/
  src/
    app.ts                              # Fastify instance factory
    server.ts                           # Entry point — boot + graceful shutdown
    shared/
      errors.ts                         # DomainError base class + typed errors
      plugins/
        errorHandler.ts                 # Fastify error-handler plugin
        cors.ts                         # CORS plugin
        helmet.ts                       # Helmet security-headers plugin
        clerkAuthPlugin.ts              # Clerk JWT verification plugin
        requireAuth.ts                  # Auth preHandler
        requireOrg.ts                   # Org-scope preHandler
      infrastructure/
        logger.ts                       # Standalone Pino logger instance
        db.ts                           # postgres.js singleton client
    modules/
      health/
        routes.ts                       # Health-check route plugin
  Dockerfile
```

### Logging

Fastify's built-in Pino logger uses pretty-print formatting (`pino-pretty`) when `NODE_ENV` is not `production`, and structured JSON otherwise. The log level is controlled by `LOG_LEVEL` (default `info`). Every HTTP request receives a unique UUID via `genReqId`.

A single static `pino()` instance is exported from `shared/infrastructure/logger.ts` and is the only shared logger in the application. Repositories, use cases, and webhook dispatchers all emit logs through this static logger — no per-request child loggers or additional instances exist.

`requestId` is automatically injected into every log line emitted during the lifecycle of a request via a Pino `mixin` backed by `AsyncLocalStorage` (SERVICES-005). A Fastify `onRequest` hook in `app.ts` stores `{ requestId: request.id }` in an `AsyncLocalStorage` instance exported from `shared/infrastructure/requestContext.ts`; the `mixin` reads this store on every log call and merges `{ requestId }` into the output. When the store is unset (server bootstrap, DB wiring, provider factory initialization), the mixin returns `{}` and `requestId` is omitted from the log line, preserving pre-request behavior unchanged. `AsyncLocalStorage` propagates the store through async boundaries (`await`, `setImmediate`, `setTimeout`, DB driver callbacks) so the correct `requestId` is present throughout the full async chain of a request, including across concurrent in-flight requests.

### Domain error model

`shared/errors.ts` defines a `DomainError` base class whose constructor signature is `(code: string, message: string, statusCode: number, originalError?: unknown)`. The optional `originalError` is stored as a public readonly property on the instance for internal logging and is never serialized in HTTP responses. All five concrete typed errors extend `DomainError` and accept the same optional `originalError`:

| Class | Code | HTTP Status |
|-------|------|-------------|
| `NotFoundError` | `NOT_FOUND` | 404 |
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 |
| `ForbiddenError` | `FORBIDDEN` | 403 |
| `ProviderError` | `PROVIDER_ERROR` | 502 or 400 |

All existing call sites that construct subclasses without a fourth argument continue to work unchanged; `originalError` is optional and defaults to `undefined`.

### Error handler (SERVICES-007)

`shared/plugins/errorHandler.ts` is the single, final logging site for every error intercepted during an HTTP request. The plugin registers a Fastify `setErrorHandler` that delegates to a private `logError` helper before sending any response.

`logError` applies three logging branches:

| Error type | Log level | Payload fields |
|---|---|---|
| `DomainError` with `statusCode < 500` | `warn` | `code`, `message`, `statusCode`, `originalError` |
| `DomainError` with `statusCode >= 500` | `error` | `code`, `message`, `statusCode`, `stack`, `originalError` |
| Non-`DomainError` | `error` | `message`, `stack`, `originalError` (the error itself) |

After logging, the handler replies as follows:

| Error type | Body | Status |
|---|---|---|
| `DomainError` | `{ code, message }` from the instance | error's `statusCode` |
| Non-`DomainError` | `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` | 500 |

`originalError`, stack traces, and all internal fields are absent from every HTTP response body. Logging uses the static Pino logger from `shared/infrastructure/logger.ts`; the `requestId` is injected automatically by the `mixin` backed by `AsyncLocalStorage` (SERVICES-005) — `errorHandler` performs no manual `requestId` extraction. Bootstrap errors (DB wiring, provider factory initialization) that occur outside a Fastify request lifecycle are not subject to this contract.

### Security plugins

- `shared/plugins/cors.ts` wraps `@fastify/cors`. The allowed origin is read from `CORS_ORIGIN` (default `*` in non-production environments).
- `shared/plugins/helmet.ts` wraps `@fastify/helmet` with default options, applying security-related HTTP headers to every response.

Both plugins are registered in `app.ts`.

### Centralized environment configuration (SERVICES-003)

All `process.env` reads in application code are eliminated in favor of typed configuration objects under `src/shared/configs/`. Three config files cover all environment variables consumed by the app:

| File | Variables |
|------|-----------|
| `src/shared/configs/serverConfig.ts` | `NODE_ENV`, `LOG_LEVEL`, `HOST`, `PORT`, `CORS_ORIGIN` |
| `src/shared/configs/authConfig.ts` | `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` |
| `src/shared/configs/mobbexConfig.ts` | `BILLING_PROVIDER`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_TEST_MODE`, `MOBBEX_TIMEOUT_MS`, `MOBBEX_WEBHOOK_SECRET` |

`app.ts`, `server.ts`, `shared/plugins/cors.ts`, `shared/infrastructure/logger.ts`, `shared/plugins/clerkAuthPlugin.ts`, `modules/webhooks/clerk/routes.ts`, and `modules/billing/providers/resolveProvider.ts` all import from these config objects instead of reading `process.env` directly.

Two documented exceptions are preserved and not migrated: `shared/infrastructure/db.ts` reads `DATABASE_URL` directly, and `shared/plugins/clerkAuthPlugin.ts` reads `CLERK_SECRET_KEY` directly. All defaults, fail-fast error messages, and startup error timing are identical to the pre-centralization state. `MOBBEX_TEST_MODE` accepts both the string `"true"` and `"1"` as enabled.

### Postgres client (SERVICES-002)

`shared/infrastructure/db.ts` exports a singleton `Sql` instance created from `DATABASE_URL` using `postgres.js`. If `DATABASE_URL` is absent or empty the module throws a descriptive error synchronously at startup, preventing the Fastify server from binding. Infrastructure code (repositories) imports this singleton directly. `@supabase/supabase-js` is no longer a runtime dependency of `apps/services`; all database operations run as direct TCP queries with no HTTP intermediary.

`UserDBRepository` and `ClerkSyncRepository` accept a `postgres.js` `Sql` instance via constructor injection and execute all queries as tagged-template SQL calls. All observable HTTP response shapes, side effects, and warning behaviors are preserved from the previous Supabase-backed implementation. `createMembership` performs three sequential queries — user lookup, organization lookup, and membership insert — emitting distinct warning logs when the user or organization row is not found, without throwing.

### File naming convention (SERVICES-004)

All files under `apps/services/src/` follow lowercase camelCase naming with no dot-separated suffixes (other than `.ts` and `.test.ts`) and no hyphens. Plugin files in `shared/plugins/` use camelCase without a `.plugin.ts` suffix (`errorHandler.ts`, `clerkAuthPlugin.ts`, `requireAuth.ts`, `requireOrg.ts`). Entity files in each module's `entities/` directory carry no `.entity.ts` suffix (`transactionEntity.ts`, `refundEntity.ts`, `subscriptionPlanEntity.ts`, `userEntity.ts`). DTO files in each module's `dtos/` directory carry no `.dto.ts` suffix (`checkoutDto.ts`, `completeOnboardingDto.ts`, `updateProfileDto.ts`). All import paths in source and test files reference these normalized names. No class, function, interface, or type name was altered; only file names and import specifiers were updated.

### Health module

`modules/health/routes.ts` registers `GET /health`, which responds with `{ status: 'ok', timestamp: <ISO string> }` from memory with no I/O. This endpoint serves as the canonical reference implementation of the vertical-slicing module convention and satisfies the App Runner health-check path.

Response time is well under 100 ms because the handler performs no external calls or I/O operations.

### Repository and adapter try/catch compliance (SERVICES-008)

Every external call in the six database repositories and the `mobbexProvider` adapter is wrapped in a `try/catch` block that satisfies the "log + wrap + re-throw" rule established in `BACKEND.md`.

**Repository catch pattern.** Each repository method body is enclosed in a single method-level `try/catch`. On failure the catch block: (1) re-throws any `DomainError` instance unchanged (preserving `NotFoundError` domain semantics and already-wrapped errors without double-wrapping), (2) emits `logger.error` with the repository class name, method name, and non-sensitive parameters (e.g. `id`, `clerkUserId`, `reference`), and (3) re-throws a `ProviderError` with `statusCode 502` and the original exception attached as `originalError`. The happy-path SQL text, return values, and latency log line inside the `try` block are identical to the pre-compliance code.

**Transactional methods in `mobbexBillingSyncRepository`.** The `updateTransactionStatus` and `upsertRefundAndMaybeMarkTransactionRefunded` methods use a two-level catch structure. Each sub-query inside the `sql.begin(async (tx) => { ... })` callback is individually wrapped: the inner catch logs the failing step and re-throws a `ProviderError`, which causes `postgres.js` to abort the transaction automatically. The outer `try/catch` around `sql.begin` re-throws `DomainError` instances without re-logging (they are already logged at the inner catch site) and handles unexpected errors that originate outside any sub-query body.

**`mobbexProvider` adapter.** The `fetchWithTimeout` method's existing catch block is augmented to emit `logger.error` for network errors and timeouts before re-throwing a `ProviderError` with `originalError` set. The `handleErrorResponse` method's JSON-parse catch emits `logger.warn` when the error body cannot be parsed, carries a code comment justifying the intentional silent-fail fallback, and preserves the existing HTTP status mapping (`statusCode 502` for 401/5xx responses, `statusCode 400` for other 4xx responses).

**Log payload invariants.** Every `logger.error` emitted in a repository or adapter catch includes explicit `repository` and `method` string fields (e.g. `repository: 'UserDBRepository', method: 'findByClerkUserId'`) so the call site is reconstructable without relying on the stack trace. Sensitive data (secrets, tokens, PII) never appears in these payloads. The `requestId` is automatically injected by the `AsyncLocalStorage` mixin (SERVICES-005), including across concurrent in-flight requests.

**Coverage.** The pattern is applied to all six repositories: `UserDBRepository`, `SubscriptionDBRepository`, `SubscriptionPlanDBRepository`, `TransactionDBRepository`, `ClerkSyncRepository`, and `MobbexBillingSyncRepository`. Unit tests for each repository and for `MobbexProvider` assert that SQL or network failures produce a `ProviderError` with `statusCode 502` and `originalError` pointing to the original cause, and that `logger.error` is called with the expected repository and method fields.

### Use case, handler and webhook route error compliance (SERVICES-009)

Every handler, webhook route, use case, and plugin in the orchestration layer satisfies the three-outcome error rule established in BACKEND.md: every `catch` block ends in log + re-throw, log + transform, or log + handle with a justifying comment. No orchestration-layer site calls `reply.status()` directly — all HTTP error serialization is delegated to `errorHandler`.

**Handler validation.** `completeOnboardingHandler` and `updateUserProfileHandler` no longer call `reply.status(400).send(...)` from a `ZodError` catch branch. Each handler retains its `try/catch` solely to distinguish `ZodError` from other parse-time errors; when a `ZodError` is caught it throws `new ValidationError(err.issues[0]?.message, err)` so `errorHandler` owns the 400 response serialization. The observable HTTP contract (400, `{ code: 'VALIDATION_ERROR', message }`) is unchanged.

**Clerk webhook route.** The missing-Svix-header guard throws `new ValidationError('Missing required Svix headers')` instead of calling `reply.status(400)`. The signature verification catch logs at `warn` level and throws `new ValidationError('Webhook signature verification failed', err)`. Both paths now produce HTTP 400 `{ code: 'VALIDATION_ERROR', message }` via `errorHandler`, replacing the previous manual `{ error: ... }` 400 response. The signature verification failure remains `ValidationError` (HTTP 400) rather than `UnauthorizedError` (HTTP 401) — changing to 401 is deferred and requires a separate design decision.

**Mobbex webhook route.** The JSON parse catch emits `logger.warn({ err: parseErr }, '…')` before throwing `ValidationError`, satisfying the logging requirement for every catch block and producing a traceable log entry when a malformed body arrives.

**Use case catch logging.** The following use cases gain structured log calls before every re-throw, transform, or silent-fail path:

| Use case | Change |
|---|---|
| `checkoutUseCase` | `logger.warn` for `DomainError` 4xx; `logger.error` for `DomainError` ≥500 and non-`DomainError`; before the existing `throw err` |
| `cancelSubscriptionUseCase` | `logger.warn` before the `return updated` silent-fail path (provider 400 case); `logger.error` before the re-throw path; inline comment justifies the non-critical silent-fail |
| `listTransactionsUseCase` | `logger.warn` in both cursor decode/parse catch branches before re-throwing; `originalError` passed when constructing `ValidationError` |

**Logging level rule.** The level decision is uniform across every modified catch: `DomainError` with `statusCode < 500` → `logger.warn`; `DomainError` with `statusCode >= 500` or non-`DomainError` → `logger.error` with stack. This matches the rule in BACKEND.md and the behavior of `errorHandler`.

**Silent-fail sites.** Every retained silent-fail carries an inline code comment explaining why the failure is non-critical and why the caller can continue:

| Site | Silent-fail reason | Comment added |
|---|---|---|
| `cancelSubscriptionUseCase` (provider 400) | Provider already cancelled on its side; local record is correct | Yes |
| `clerkAuthPlugin` (JWT failure) | Invalid or expired JWT leaves `userId`/`orgId` unset; downstream `requireAuth`/`requireOrg` decide whether the route requires auth | Yes |
| `mobbexProvider.handleErrorResponse` (body parse fail) | Provider error body is not JSON; mapping continues with the HTTP status received | Verified/reinforced |

**`requestId` in catch logs.** The static Pino logger from `shared/infrastructure/logger.ts` is used at every catch site. The `AsyncLocalStorage` mixin (SERVICES-005) injects `requestId` automatically — no per-request child logger is introduced.

**HTTP contract invariant.** Every 4xx and 5xx response originating in the affected sites now carries the body `{ code, message }` for `DomainError` instances and `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` for non-`DomainError` instances, always serialized by `errorHandler`. The previous `{ error: ... }` shape emitted by the Clerk webhook route for missing headers is replaced by the standard `{ code: 'VALIDATION_ERROR', message }` shape.

### Container image

`apps/services/Dockerfile` uses a two-stage build:

1. **builder** stage — `node:20-alpine`, installs all workspace dependencies, compiles TypeScript with `tsc`.
2. **runner** stage — `node:20-alpine`, copies only `dist/` and `node_modules/`, sets `NODE_ENV=production`, exposes port `3000`, runs `node dist/server.js`.

The image is structured for deployment on AWS App Runner: binds to `0.0.0.0:3000` and exposes `/health` as the health-check path.
