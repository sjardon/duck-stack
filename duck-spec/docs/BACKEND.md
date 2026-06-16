# Backend

Living document describing backend conventions, patterns, and stack decisions for duck-stack.

---

## Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js |
| Framework | Fastify |
| Language | TypeScript (strict mode via `@repo/tsconfig`) |
| Module system | ESM with `NodeNext` module resolution |
| Logger | Pino (built into Fastify) + `pino-pretty` in development |
| Database client | `@supabase/supabase-js` (singleton) |
| Security headers | `@fastify/helmet` |
| CORS | `@fastify/cors` |
| Dev runner | `tsx watch` |
| Build | `tsc` |
| Lint | ESLint via `@repo/eslint-config` |

## App architecture

`apps/services` follows a **simplified hexagonal architecture with vertical slicing**. Dependency injection is manual (constructor injection); no DI container is used.

### Entry point split

| File | Responsibility |
|------|---------------|
| `src/app.ts` | `createApp(): Promise<FastifyInstance>` — instantiates Fastify, registers shared plugins and feature modules. Does not call `listen`. |
| `src/server.ts` | Calls `createApp()`, reads `HOST`/`PORT` from env, calls `fastify.listen()`, registers `SIGINT`/`SIGTERM` handlers for graceful shutdown. |

### Directory conventions

```
src/
  app.ts                        # Fastify instance factory
  server.ts                     # Entry point
  shared/
    errors.ts                   # DomainError base class + typed errors
    plugins/                    # Reusable Fastify plugins (error-handler, cors, helmet)
    infrastructure/             # Singletons shared across modules (logger, supabase)
  modules/
    <name>/
      routes.ts                 # Fastify plugin registering routes for this module
```

Feature modules live under `src/modules/<name>/`. Each module exposes a `routes.ts` Fastify plugin that is registered in `app.ts`. This is the canonical pattern: see `modules/health/routes.ts`.

## Logging strategy

Two complementary Pino instances are used:

| Context | Source | Format |
|---------|--------|--------|
| HTTP requests | Fastify built-in logger (configured at instantiation) | `pino-pretty` when `NODE_ENV !== 'production'`; JSON in production |
| Non-request code (use cases, repositories) | `shared/infrastructure/logger.ts` standalone `pino()` | Same level and transport as Fastify logger |

Every HTTP request receives a UUID via `genReqId: () => crypto.randomUUID()`. The `reqId` is included in every request-scoped log line for end-to-end traceability.

Log level is controlled by the `LOG_LEVEL` environment variable (default `info`).

## Domain error model

All domain errors extend `DomainError` from `shared/errors.ts`:

```ts
class DomainError extends Error {
  constructor(code: string, message: string, statusCode: number = 500)
}
```

Built-in typed errors: `NotFoundError` (404), `ValidationError` (400), `UnauthorizedError` (401).

The `shared/plugins/error-handler.ts` plugin uses `fastify.setErrorHandler` to intercept `DomainError` instances and reply with:

```json
{ "code": "<string>", "message": "<string>" }
```

at the error's `statusCode`. Unknown errors fall through to Fastify's default handler.

## Security plugins

Both plugins are registered in `app.ts` and apply globally:

- `shared/plugins/cors.ts` — wraps `@fastify/cors`; `CORS_ORIGIN` env var controls the allowed origin (default `*` outside production).
- `shared/plugins/helmet.ts` — wraps `@fastify/helmet` with default options; adds security-related HTTP headers to every response.

## Supabase client

`shared/infrastructure/supabase.ts` exports a singleton `SupabaseClient` created once at module load from `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The module throws at startup if either variable is absent. Infrastructure code (repositories) imports this singleton directly.

## TypeScript configuration

`apps/services/tsconfig.json` extends `@repo/tsconfig/base.json` and overrides `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` for Node.js ESM compatibility.

## Shared domain types

Backend code imports shared TypeScript interfaces from `@repo/types`. This package has zero runtime dependencies and exposes only TypeScript interfaces resolved directly from `src/index.ts`.

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsx watch src/index.ts` — live-reload dev server |
| `build` | `tsc` — compiles to `dist/` |
| `lint` | `eslint src` |
