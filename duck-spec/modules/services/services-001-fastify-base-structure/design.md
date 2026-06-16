# SERVICES-001 — Fastify Base Structure — Design

## Problem statement

The `services` app exists in the monorepo as a single flat file that conflates bootstrap, routing, and startup into one entry point with no shared infrastructure, no logging strategy, no domain error handling, and no security headers. Before any real domain module can be added, the backend needs a well-defined base architecture so that every future module plugs into a consistent, predictable structure following a simplified hexagonal architecture with vertical slicing.

## Alternatives

| Name | Description | Verdict |
|---|---|---|
| Flat Plugin Registry | Keep a single `app.ts` that inline-registers all plugins and routes via `fastify.register()` calls without any folder hierarchy, relying on Fastify's encapsulation for isolation. | Not chosen — does not establish the vertical-slicing folder convention needed for future domain modules and makes shared infrastructure imports implicit. |
| Hexagonal + Vertical Slicing (Module Files) | Split the app into `app.ts` (bootstrap) and `server.ts` (entry point), place all cross-cutting concerns under `shared/` (plugins, infrastructure, errors), and place each domain module under `modules/<name>/routes.ts` with manual constructor injection for dependencies. | Chosen — directly maps every R-ID to an explicit file, enforces the hexagonal + vertical-slicing constraint from analysis.md, and keeps injection explicit without a DI container. |
| NestJS-style Module Decorators | Introduce a decorator-based module system (or a lightweight equivalent) where each module declares its providers, controllers, and exports, similar to NestJS but built on top of Fastify. | Not chosen — violates the "manual constructor injection" technical constraint, introduces significant framework overhead, and is out of scope for a base-structure feature. |

## Chosen solution

**Hexagonal + Vertical Slicing (Module Files)**

This approach directly satisfies all 12 functional requirements: R001 and R002 are covered by the `app.ts`/`server.ts` split; R003 by the shutdown handlers in `server.ts`; R004 and R005 by the dual Pino strategy; R006 and R007 by the shared error model and plugin; R008 and R009 by the two security plugins; R010 by the Supabase singleton; R011 by the health module; and R012 by the Dockerfile. NF001 is satisfied because the health route is an in-memory no-op. NF002 is satisfied by enabling Fastify's built-in `genReqId` and including `reqId` in the Pino serializer config so every request-scoped log line carries a request ID.

## Technical design

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
        cors.ts                         # CORS plugin wrapper
        helmet.ts                       # Helmet plugin wrapper
      infrastructure/
        logger.ts                       # Standalone Pino logger instance
        supabase.ts                     # Supabase singleton client
    modules/
      health/
        routes.ts                       # Health-check route plugin
  Dockerfile
```

### `app.ts` — Fastify instance factory

```ts
// createApp(): FastifyInstance
// 1. Instantiate Fastify with logger config (see Pino section below).
// 2. Register shared plugins: error-handler, cors, helmet.
// 3. Register feature modules: health routes.
// 4. Return the instance (does NOT call listen — that is server.ts's job).
export async function createApp(): Promise<FastifyInstance>
```

### `server.ts` — entry point

```ts
// 1. Call createApp() to obtain the Fastify instance.
// 2. Read HOST (default '0.0.0.0') and PORT (default 3000) from env.
// 3. Call fastify.listen({ host, port }).
// 4. Register SIGINT and SIGTERM handlers:
//    - Call fastify.close() on signal.
//    - Exit with code 0 on success, code 1 on error.
```

### Pino logger strategy (R004, R005, NF002)

**Request-scoped (inside Fastify):** Fastify is instantiated with:
```ts
{
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  genReqId: () => crypto.randomUUID(),  // satisfies NF002
}
```

**Standalone instance (`shared/infrastructure/logger.ts`):** Created with `pino()` using the same level and transport config so non-request code (repositories, use cases) emits structured logs at the same fidelity.

### Domain error model (`shared/errors.ts`, R006)

```ts
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// Concrete typed errors extend DomainError, e.g.:
export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super('UNAUTHORIZED', 'Unauthorized', 401);
  }
}
```

### Error-handler plugin (`shared/plugins/error-handler.ts`, R007)

Registered as a Fastify plugin using `fastify.setErrorHandler`. When the error is an instance of `DomainError`, it replies with `{ code, message }` at the error's `statusCode`. All other errors fall through to Fastify's default handler.

```ts
// HTTP response shape for DomainError:
{ "code": string, "message": string }   // status = error.statusCode
```

### CORS plugin (`shared/plugins/cors.ts`, R008)

Wraps `@fastify/cors`. Origin is read from `CORS_ORIGIN` env (default `*` for non-production). Exported as a Fastify plugin registered in `app.ts`.

### Helmet plugin (`shared/plugins/helmet.ts`, R009)

Wraps `@fastify/helmet` with default options. Exported as a Fastify plugin registered in `app.ts`.

### Supabase singleton (`shared/infrastructure/supabase.ts`, R010)

```ts
// Reads SUPABASE_URL and SUPABASE_ANON_KEY from environment.
// Throws at module load time if either variable is absent.
// Exports a single createClient() result as `supabase`.
export const supabase: SupabaseClient
```

### Health module (`modules/health/routes.ts`, R011, NF001)

```ts
// Fastify plugin that registers:
// GET /health  → 200 { status: 'ok', timestamp: <ISO string> }
// In-memory response — no I/O, satisfies NF001 (< 100ms).
```

### Dockerfile (R012)

Multi-stage build:
1. **builder** stage: `node:20-alpine`, installs all workspace dependencies, builds the `services` package with `tsc`.
2. **runner** stage: `node:20-alpine`, copies only `dist/` and `node_modules/`, sets `NODE_ENV=production`, exposes port 3000, runs `node dist/server.js`.

The image is structured for AWS App Runner: listens on `0.0.0.0:3000`, health-check path `/health`.

### `package.json` additions

The following runtime dependencies must be added:

| Package | Purpose |
|---|---|
| `@fastify/cors` | CORS support (R008) |
| `@fastify/helmet` | Security headers (R009) |
| `pino-pretty` | Dev-mode pretty logging (R004) |
| `@supabase/supabase-js` | Supabase client (R010) |

## Files

| Path | Action |
|---|---|
| `apps/services/src/app.ts` | CREATE |
| `apps/services/src/server.ts` | CREATE |
| `apps/services/src/shared/errors.ts` | CREATE |
| `apps/services/src/shared/plugins/error-handler.ts` | CREATE |
| `apps/services/src/shared/plugins/cors.ts` | CREATE |
| `apps/services/src/shared/plugins/helmet.ts` | CREATE |
| `apps/services/src/shared/infrastructure/logger.ts` | CREATE |
| `apps/services/src/shared/infrastructure/supabase.ts` | CREATE |
| `apps/services/src/modules/health/routes.ts` | CREATE |
| `apps/services/src/index.ts` | MODIFY (replace with import of server.ts bootstrap) |
| `apps/services/package.json` | MODIFY (add @fastify/cors, @fastify/helmet, pino-pretty, @supabase/supabase-js) |
| `apps/services/Dockerfile` | CREATE |

## Requirement coverage

| ID | Design decision |
|---|---|
| R001 | `app.ts` — `createApp()` instantiates Fastify and calls `fastify.register()` for each plugin and module. |
| R002 | `server.ts` — calls `createApp()`, reads HOST/PORT from env, calls `fastify.listen()`. |
| R003 | `server.ts` — registers `process.on('SIGINT')` and `process.on('SIGTERM')` handlers that call `fastify.close()`. |
| R004 | Fastify instantiation in `app.ts` uses pino-pretty transport when `NODE_ENV !== 'production'`, JSON otherwise. |
| R005 | `shared/infrastructure/logger.ts` exports a `pino()` instance with the same level/transport config as the Fastify logger. |
| R006 | `shared/errors.ts` defines `DomainError` base class with `code`, `message`, `statusCode`, plus `NotFoundError`, `ValidationError`, and `UnauthorizedError`. |
| R007 | `shared/plugins/error-handler.ts` uses `fastify.setErrorHandler`; detects `instanceof DomainError` and replies with the mapped HTTP status and `{ code, message }` body. |
| R008 | `shared/plugins/cors.ts` wraps `@fastify/cors` and is registered in `app.ts`. |
| R009 | `shared/plugins/helmet.ts` wraps `@fastify/helmet` and is registered in `app.ts`. |
| R010 | `shared/infrastructure/supabase.ts` exports a singleton `supabase` created once at module load using `SUPABASE_URL` and `SUPABASE_ANON_KEY`. |
| R011 | `modules/health/routes.ts` registers `GET /health` returning `{ status: 'ok', timestamp }` in memory. |
| R012 | `apps/services/Dockerfile` uses a two-stage build (builder + runner) targeting AWS App Runner on port 3000. |
| NF001 | Health route is an in-memory operation with no I/O or external calls, ensuring sub-100ms response. |
| NF002 | Fastify is instantiated with `genReqId: () => crypto.randomUUID()` so every request-scoped log line includes a unique `reqId`. |
