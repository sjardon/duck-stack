# SERVICES-001 — Fastify Base Structure — Tasks

## T001 — Add runtime dependencies to package.json

In `apps/services/package.json`, add the following to `dependencies`:
- `@fastify/cors` (latest compatible with Fastify 4)
- `@fastify/helmet` (latest compatible with Fastify 4)
- `pino-pretty` (devDependency — used only in development transport)
- `@supabase/supabase-js`

**File:** `apps/services/package.json`
**Covers:** R008, R009, R004, R010

---

## T002 — Create DomainError base class and typed domain errors

In `apps/services/src/shared/errors.ts`, define:
- `DomainError` class extending `Error` with constructor `(code: string, message: string, statusCode: number = 500)`, setting `this.name = 'DomainError'`.
- `NotFoundError extends DomainError` with `statusCode = 404` and code `'NOT_FOUND'`.
- `ValidationError extends DomainError` with `statusCode = 400` and code `'VALIDATION_ERROR'`.
- `UnauthorizedError extends DomainError` with `statusCode = 401` and code `'UNAUTHORIZED'`.

Export all four classes.

**File:** `apps/services/src/shared/errors.ts`
**Covers:** R006

---

## T003 — Create standalone Pino logger instance

In `apps/services/src/shared/infrastructure/logger.ts`, create and export a `pino()` logger instance named `logger` configured with:
- `level` from `process.env.LOG_LEVEL` falling back to `'info'`.
- `transport` set to `{ target: 'pino-pretty', options: { colorize: true } }` when `process.env.NODE_ENV !== 'production'`, and `undefined` otherwise.

**File:** `apps/services/src/shared/infrastructure/logger.ts`
**Covers:** R005, R004

---

## T004 — Create Supabase singleton client

In `apps/services/src/shared/infrastructure/supabase.ts`:
- Read `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `process.env`.
- Throw a descriptive `Error` at module load time if either variable is absent.
- Call `createClient(supabaseUrl, supabaseAnonKey)` once and export the result as `supabase`.

**File:** `apps/services/src/shared/infrastructure/supabase.ts`
**Covers:** R010

---

## T005 — Create error-handler Fastify plugin

In `apps/services/src/shared/plugins/error-handler.ts`, create a Fastify plugin (using `fp` from `fastify-plugin`) that:
- Calls `fastify.setErrorHandler((error, request, reply) => { ... })`.
- Inside the handler: if `error instanceof DomainError`, call `reply.status(error.statusCode).send({ code: error.code, message: error.message })`.
- Otherwise, call `reply.send(error)` to pass the error to Fastify's default handler.

Export the plugin as the default export.

**File:** `apps/services/src/shared/plugins/error-handler.ts`
**Covers:** R007

---

## T006 — Create CORS Fastify plugin

In `apps/services/src/shared/plugins/cors.ts`, create a Fastify plugin (using `fp` from `fastify-plugin`) that:
- Registers `@fastify/cors` with `origin` read from `process.env.CORS_ORIGIN`, defaulting to `'*'`.

Export the plugin as the default export.

**File:** `apps/services/src/shared/plugins/cors.ts`
**Covers:** R008

---

## T007 — Create Helmet Fastify plugin

In `apps/services/src/shared/plugins/helmet.ts`, create a Fastify plugin (using `fp` from `fastify-plugin`) that:
- Registers `@fastify/helmet` with default options.

Export the plugin as the default export.

**File:** `apps/services/src/shared/plugins/helmet.ts`
**Covers:** R009

---

## T008 — Create health-check route module

In `apps/services/src/modules/health/routes.ts`, create a Fastify plugin (using `fp` from `fastify-plugin`) that:
- Registers `GET /health` returning `reply.send({ status: 'ok', timestamp: new Date().toISOString() })` with no I/O or external calls.

Export the plugin as the default export.

**File:** `apps/services/src/modules/health/routes.ts`
**Covers:** R011, NF001

---

## T009 — Create app.ts Fastify instance factory

In `apps/services/src/app.ts`, export an async function `createApp(): Promise<FastifyInstance>` that:
1. Instantiates Fastify with:
   - `logger` configured with `level` from `process.env.LOG_LEVEL ?? 'info'` and pino-pretty transport when `process.env.NODE_ENV !== 'production'`.
   - `genReqId: () => crypto.randomUUID()` so every request log line includes a unique request ID.
2. Awaits `fastify.register(errorHandlerPlugin)`.
3. Awaits `fastify.register(corsPlugin)`.
4. Awaits `fastify.register(helmetPlugin)`.
5. Awaits `fastify.register(healthRoutes)`.
6. Returns `fastify`.

**File:** `apps/services/src/app.ts`
**Covers:** R001, R004, NF002

---

## T010 — Create server.ts entry point with graceful shutdown

In `apps/services/src/server.ts`, write the main bootstrap logic:
1. Call `createApp()` to obtain the Fastify instance.
2. Read `HOST` from `process.env.HOST` defaulting to `'0.0.0.0'` and `PORT` from `process.env.PORT` defaulting to `3000`.
3. Call `await fastify.listen({ host, port })`.
4. Register `process.on('SIGINT', shutdown)` and `process.on('SIGTERM', shutdown)`.
5. Define `async function shutdown()` that calls `await fastify.close()`, then `process.exit(0)` on success or `process.exit(1)` on error.

**File:** `apps/services/src/server.ts`
**Covers:** R002, R003

---

## T011 — Replace index.ts with server entry point import

In `apps/services/src/index.ts`, replace all existing content with a single statement that imports and executes `server.ts`:
```ts
import './server.js';
```

This preserves the existing entry point path (`src/index.ts` referenced in `package.json` `dev` script) while delegating all logic to `server.ts`.

**File:** `apps/services/src/index.ts`
**Covers:** R002

---

## T012 — Create Dockerfile for AWS App Runner

In `apps/services/Dockerfile`, write a two-stage Dockerfile:

**Stage 1 — builder** (`node:20-alpine`):
- Set `WORKDIR /app`.
- Copy workspace root `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`.
- Copy `apps/services/package.json` to its workspace path.
- Run `pnpm install --frozen-lockfile`.
- Copy `apps/services/src` and `apps/services/tsconfig.json`.
- Run `pnpm --filter services build` (invokes `tsc`).

**Stage 2 — runner** (`node:20-alpine`):
- Set `WORKDIR /app`.
- Set `ENV NODE_ENV=production`.
- Copy `node_modules/` and `dist/` from the builder stage.
- `EXPOSE 3000`.
- `CMD ["node", "dist/server.js"]`.

**File:** `apps/services/Dockerfile`
**Covers:** R012
