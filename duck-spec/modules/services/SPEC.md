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
        error-handler.ts                # Fastify error-handler plugin
        cors.ts                         # CORS plugin
        helmet.ts                       # Helmet security-headers plugin
      infrastructure/
        logger.ts                       # Standalone Pino logger instance
        db.ts                           # postgres.js singleton client
    modules/
      health/
        routes.ts                       # Health-check route plugin
  Dockerfile
```

### Logging

Fastify's built-in Pino logger uses pretty-print formatting (`pino-pretty`) when `NODE_ENV` is not `production`, and structured JSON otherwise. The log level is controlled by `LOG_LEVEL` (default `info`). Every HTTP request receives a unique UUID via `genReqId`, and that `reqId` appears in every request-scoped log line for end-to-end traceability.

A standalone `pino()` instance is exported from `shared/infrastructure/logger.ts` with the same level and transport configuration, for use outside the Fastify request context (use cases, repositories).

### Domain error model

`shared/errors.ts` defines a `DomainError` base class with `code`, `message`, and `statusCode` fields. Concrete typed errors extend it:

| Class | Code | HTTP Status |
|-------|------|-------------|
| `NotFoundError` | `NOT_FOUND` | 404 |
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 |

The error-handler plugin (`shared/plugins/error-handler.ts`) uses `fastify.setErrorHandler` to intercept any `DomainError` and reply with `{ code, message }` at the matching HTTP status. All other errors fall through to Fastify's default handler.

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

`app.ts`, `server.ts`, `shared/plugins/cors.ts`, `shared/infrastructure/logger.ts`, `shared/plugins/clerk-auth.plugin.ts`, `modules/webhooks/clerk/routes.ts`, and `modules/billing/providers/resolveProvider.ts` all import from these config objects instead of reading `process.env` directly.

Two documented exceptions are preserved and not migrated: `shared/infrastructure/db.ts` reads `DATABASE_URL` directly, and `shared/plugins/clerk-auth.plugin.ts` reads `CLERK_SECRET_KEY` directly. All defaults, fail-fast error messages, and startup error timing are identical to the pre-centralization state. `MOBBEX_TEST_MODE` accepts both the string `"true"` and `"1"` as enabled.

### Postgres client (SERVICES-002)

`shared/infrastructure/db.ts` exports a singleton `Sql` instance created from `DATABASE_URL` using `postgres.js`. If `DATABASE_URL` is absent or empty the module throws a descriptive error synchronously at startup, preventing the Fastify server from binding. Infrastructure code (repositories) imports this singleton directly. `@supabase/supabase-js` is no longer a runtime dependency of `apps/services`; all database operations run as direct TCP queries with no HTTP intermediary.

`UserDBRepository` and `ClerkSyncRepository` accept a `postgres.js` `Sql` instance via constructor injection and execute all queries as tagged-template SQL calls. All observable HTTP response shapes, side effects, and warning behaviors are preserved from the previous Supabase-backed implementation. `createMembership` performs three sequential queries — user lookup, organization lookup, and membership insert — emitting distinct warning logs when the user or organization row is not found, without throwing.

### Health module

`modules/health/routes.ts` registers `GET /health`, which responds with `{ status: 'ok', timestamp: <ISO string> }` from memory with no I/O. This endpoint serves as the canonical reference implementation of the vertical-slicing module convention and satisfies the App Runner health-check path.

Response time is well under 100 ms because the handler performs no external calls or I/O operations.

### Container image

`apps/services/Dockerfile` uses a two-stage build:

1. **builder** stage — `node:20-alpine`, installs all workspace dependencies, compiles TypeScript with `tsc`.
2. **runner** stage — `node:20-alpine`, copies only `dist/` and `node_modules/`, sets `NODE_ENV=production`, exposes port `3000`, runs `node dist/server.js`.

The image is structured for deployment on AWS App Runner: binds to `0.0.0.0:3000` and exposes `/health` as the health-check path.
