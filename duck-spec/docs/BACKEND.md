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
| Database client | `@supabase/supabase-js` (singleton) |
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

Feature modules live under `src/modules/<name>/` and expose a `routes.ts` Fastify plugin registered in `app.ts`. Shared infrastructure (logger, Supabase client) lives under `src/shared/infrastructure/`. Reusable plugins under `src/shared/plugins/`.

## Logging strategy

| Context | Instance | Format |
|---------|----------|--------|
| HTTP requests | Fastify built-in logger | `pino-pretty` in dev; JSON in production |
| Non-request code | `shared/infrastructure/logger.ts` standalone pino | Same level and transport |

Every request gets a UUID via `genReqId`. `LOG_LEVEL` env var controls level (default `info`).

## Domain error model

All domain errors extend `DomainError` from `shared/errors.ts`: `(code: string, message: string, statusCode: number)`. Built-in typed errors: `NotFoundError` (404), `ValidationError` (400), `UnauthorizedError` (401).

`shared/plugins/error-handler.ts` intercepts `DomainError` and replies `{ code, message }` at the error's `statusCode`. Unknown errors fall through to Fastify's default handler.

## Security plugins

Registered globally in `app.ts`:
- `shared/plugins/cors.ts` — `CORS_ORIGIN` env var controls allowed origin (default `*` outside production)
- `shared/plugins/helmet.ts` — default `@fastify/helmet` options on every response

## Supabase client

`shared/infrastructure/supabase.ts` exports a singleton created from `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Throws at startup if either is absent. Repositories import this singleton directly.

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc` |
| `lint` | `eslint src` |
