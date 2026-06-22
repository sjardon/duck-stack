# Architecture

Living document describing the monorepo structure, service topology, and cross-cutting technical decisions of duck-stack. Updated when a feature changes inter-service relationships or fundamental stack choices.

---

## Monorepo structure

pnpm workspace monorepo orchestrated by Turborepo.

```
/
├── apps/
│   ├── web/           ← Vite + React + TypeScript SPA (authenticated users)
│   ├── landing/       ← Vite + React + TypeScript SPA (marketing)
│   └── services/      ← Fastify + TypeScript backend API
└── packages/
    ├── tsconfig/      ← @repo/tsconfig — shared TypeScript base config
    ├── eslint-config/ ← @repo/eslint-config — shared ESLint rules
    └── types/         ← @repo/types — shared domain interfaces
```

## Services

| Service | Technology | Role |
|---------|-----------|------|
| `apps/web` | Vite + React + TypeScript, React Query, Zustand | Main SPA for authenticated users |
| `apps/landing` | Vite + React + TypeScript | Public marketing SPA |
| `apps/services` | Fastify + TypeScript | Backend API. Containerised; deployed to AWS App Runner via ECR. |

## External integrations

| Integration | Service | Role |
|-------------|---------|------|
| Clerk | `apps/web`, `apps/services` | End-to-end identity provider. `apps/web` manages user sessions via `@clerk/clerk-react`. `apps/services` verifies Clerk JWTs locally via `@clerk/backend` (JWKS cached at startup; no per-request Clerk API call). Clerk also delivers lifecycle events (user and organization create/update) to `apps/services` via webhook. |
| Supabase | `apps/services` | Relational database. `apps/services` connects via `postgres.js` over a direct TCP connection using `DATABASE_URL`. Schema migrations are managed with the Supabase CLI under `apps/services/supabase/migrations/`. |

## Inter-service communication

`apps/web` calls `apps/services` over HTTP using the `VITE_API_URL` environment variable as the base URL. All calls are routed through `api/client.ts` (`apiFetch`). In development `VITE_API_URL` defaults to `http://localhost:3000`; in production it points to the App Runner service URL.

Authenticated requests include an `Authorization: Bearer <token>` header. `api/client.ts` reads the token from `useSessionStore.token()`, which wraps Clerk's `getToken()`. `apps/services` verifies the token in a global `onRequest` hook before any route handler runs.

## Shared packages

| Package | Name | Role |
|---------|------|------|
| `packages/tsconfig` | `@repo/tsconfig` | Base TypeScript config (`strict`, `ESNext`); all workspaces extend it |
| `packages/eslint-config` | `@repo/eslint-config` | Shared ESLint rules with TypeScript support |
| `packages/types` | `@repo/types` | Pure TypeScript domain interfaces; zero runtime dependencies |

## Turborepo pipeline

| Task | dependsOn | Behaviour |
|------|-----------|-----------|
| `build` | `["^build"]` | Compiles all workspaces in upstream dependency order |
| `dev` | — | Persistent; all dev servers start in parallel |
| `lint` | — | ESLint across all workspaces |

Root `package.json` scripts delegate to turbo: `pnpm build`, `pnpm dev`, `pnpm lint`.

## TypeScript strategy

All workspaces extend `@repo/tsconfig/base.json` (`strict: true`, `target: ESNext`, `moduleResolution: Bundler`). `apps/services` overrides to `NodeNext` for Node.js ESM compatibility.

Workspace inter-dependencies use the pnpm `workspace:*` protocol, which resolves to live symlinks — changes to a shared package are immediately visible to dependent apps.
