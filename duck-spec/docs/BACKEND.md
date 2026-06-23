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

## Logging strategy

| Context | Instance | Format |
|---------|----------|--------|
| HTTP requests | Fastify built-in logger | `pino-pretty` in dev; JSON in production |
| Non-request code | `shared/infrastructure/logger.ts` standalone pino | Same level and transport |

Every request gets a UUID via `genReqId`. `LOG_LEVEL` env var controls level (default `info`).

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

`shared/plugins/error-handler.ts` intercepts `DomainError` and replies `{ code, message }` at the error's `statusCode`. Unknown errors fall through to Fastify's default handler.

## Security plugins

Registered globally in `app.ts`:
- `shared/plugins/cors.ts` — `CORS_ORIGIN` env var controls allowed origin (default `*` outside production)
- `shared/plugins/helmet.ts` — default `@fastify/helmet` options on every response

## Authentication plugin

`shared/plugins/clerk-auth.plugin.ts` is registered via `fastify-plugin` immediately after the security plugins so its `onRequest` hook fires on all routes. The plugin:

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
| `requireAuth` | `require-auth.ts` | Throws `UnauthorizedError` (401) when `request.userId` is `undefined` |
| `requireOrg` | `require-org.ts` | Calls `requireAuth`, then throws `ForbiddenError` (403) when `request.orgId` is `null` |

Neither preHandler is registered globally. Routes opt in by listing the relevant function in their `preHandler` array. Organization-scoped enforcement is a per-route decision — the starter does not impose it globally.

## Database client

`shared/infrastructure/db.ts` exports a `postgres.js` `Sql` singleton created from `DATABASE_URL`. Throws a descriptive error synchronously at module load time if `DATABASE_URL` is absent or empty, preventing the server from starting. Repositories import this singleton directly and execute all queries as tagged-template SQL calls over a direct TCP connection to Postgres. `@supabase/supabase-js` is not a runtime dependency of `apps/services`.

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

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc` |
| `lint` | `eslint src` |
