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
| Dev runner | `tsx watch` |
| Build | `tsc` |
| Lint | ESLint via `@repo/eslint-config` |

## Service entry point

`apps/services/src/index.ts` creates and starts a Fastify server. The server exposes a GET `/health` route returning `{ "status": "ok" }`.

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
