# BACKEND SERVICES

Conventions, architecture, layer rules, error model, logging rules, and comment rules for everything under `apps/services/`. The rules here are hard constraints.

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

`requestId` is injected automatically into every log line via `AsyncLocalStorage` — see `shared/infrastructure/requestContext.ts` and the `mixin` in `logger.ts`. Do not pass it by parameter.

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
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` |

Some subclasses (`QuotaExceededError`, `TrialExpiredError`, `ServiceUnavailableError`) serialize extra fields or headers beyond `{ code, message }` — check the class definition in `shared/errors.ts` when working with one directly.

`shared/plugins/errorHandler.ts` intercepts every error — see § errorHandler response contract below.

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
3. **Log + handle** — fallback, alternative source, or sentinel value. Only when the failure is non-critical. Try to donot do this.

### Logging

- Log at every `catch`. Prefer duplicate logs over missing ones.
- `warn` for `DomainError` 4xx; `error` (with stack) for `DomainError` ≥ 500 and any non-`DomainError`.
- `errorHandler.ts` is the final log site — it logs every error before replying.

### `errorHandler` response contract

| Caught error | Body | Status |
|---|---|---|
| `DomainError` | `{ code, message }` from the instance | error's `statusCode` |
| Any other | `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` | 500 |

`originalError` is logged but never serialized in the response. `QuotaExceededError`, `TrialExpiredError`, and `ServiceUnavailableError` are special-cased with additional response data (extra body fields or, for `ServiceUnavailableError`, a `Retry-After` header) beyond the base `{ code, message }` contract — see "Domain error model" above.

### Anti-patterns

- `try/catch` in a handler to call `reply.code(500)` — duplicates `errorHandler`.
- `catch (e) {}` or `return null` without a justifying comment.
- `throw new Error('failed')` — loses the stack and type. Wrap in a `DomainError` with `originalError`.
- Unawaited promises outside a wrapper that catches and logs.

## Security plugins

Registered globally in `app.ts`:
- `shared/plugins/cors.ts` — `CORS_ORIGIN` env var controls allowed origin (default `*` outside production)
- `shared/plugins/helmet.ts` — default `@fastify/helmet` options on every response

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

- **One handler per feature.** Handlers only instantiate repositories and inject them into the use case. No business logic. Instantiate the repository and the use case inside the handler function body (per invocation), in the same file — not at module scope. Module-scope instantiation runs at import time, which breaks `jest.mock()`-based unit tests that need to inject mocks before the dependency is constructed.
- **One use case per feature.** Use cases contain pure business logic with no framework or concrete service dependencies. They only consume repositories — **a use case never consumes another use case** under any circumstance.
- **One repository per entity per data source.** `usersRepository.ts`, `usersCacheRepository.ts`, `usersEventsRepository.ts` are separate repositories because they target different data sources for the same entity. Mixing two entities in one repository (e.g. transactions + refunds) is a SRP violation — split them.
- **Shared repositories live in `src/shared/repositories/`** when two or more modules depend on the same repository.
- **Shared providers live in `src/shared/providers/`** when two or more modules depend on the same provider adapter — e.g. `ClerkMetadataProvider`, consumed by both `clerkAuthPlugin` and `modules/webhooks/clerk/`; or the `errorReporter` singleton (`IErrorReporter`/`SentryErrorReporter`/`NoopErrorReporter`), consumed by both `shared/plugins/errorHandler.ts` and `modules/notifications/providers/resendEmailNotifier.ts`. Module-scoped provider adapters (a single consumer) stay under `modules/<feature>/providers/`, as with `modules/billing/providers/mobbexProvider.ts`.
- **Use cases depend on interfaces, never on implementations.** Handlers do the wiring (`new FooDBRepository(db)`) and pass the instance to the use case constructor typed as `IFooRepository`.

### Repository interface pattern

Repository interfaces (`IFooRepository`) define only the data-access contract. Implementations (`FooDBRepository`) are instantiated directly in handlers — no DI container is used. This keeps use cases testable by substituting a fake repository without a real database.

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
| `errorTrackingConfig.ts` | `ERROR_TRACKING_DSN`, `ERROR_TRACKING_SAMPLE_RATE`, `SERVICE_VERSION` |
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

## Deep-dive documentation

`duck-spec/docs/BACKEND.md` covers auth/Clerk internals, database query rules, pagination, and webhook handling — long, feature-specific sections most tasks don't need. Never `Read` that file in full. Consult it via the ds-context protocol:

1. `bash .claude/skills/ds-context/scripts/toc.sh duck-spec/docs/BACKEND.md`
2. `bash .claude/skills/ds-context/scripts/section.sh duck-spec/docs/BACKEND.md "<heading>"` for each section that applies to your task.
