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
| `apps/web` | Vite + React + TypeScript, React Query, Zustand | Main SPA for authenticated users. Static build deployed to its own Cloudflare Pages project (INFRA-009). |
| `apps/landing` | Vite + React + TypeScript | Public marketing SPA. Static build deployed to its own Cloudflare Pages project (INFRA-009). |
| `apps/services` | Fastify + TypeScript | Backend API. Containerised; deployed to AWS App Runner via ECR. |

## External integrations

| Integration | Service | Role |
|-------------|---------|------|
| Clerk | `apps/web`, `apps/services` | End-to-end identity provider. `apps/web` manages user sessions via `@clerk/clerk-react`. `apps/services` verifies Clerk JWTs locally via `@clerk/backend` (JWKS cached at startup; no per-request Clerk API call for verification). Clerk also delivers lifecycle events (user and organization create/update) to `apps/services` via webhook. `apps/services` writes back to Clerk on the `user.created`/`organization.created` webhook (and, as a lazy fallback, from `clerkAuthPlugin`) via `clerkClient.users.updateUserMetadata`/`organizations.updateOrganizationMetadata`, storing the internal `users.id`/`organizations.id` UUID in `private_metadata` so it is available as a custom JWT claim (`app_user_id`/`app_org_id`) on subsequent requests. |
| Supabase | `apps/services` | Relational database. `apps/services` connects via `postgres.js` over a direct TCP connection using `DATABASE_URL`. Schema migrations are managed with the Supabase CLI under `apps/services/supabase/migrations/`. |
| Mobbex | `apps/services` | Payment provider (Argentina/LATAM market). Accessed exclusively through the `PaymentProvider` port defined in `@repo/types`; the `MobbexProvider` adapter in `apps/services/src/modules/billing/providers/` is the only concrete implementation. No other module imports from the adapter directly. |
| AWS SES v2 | `apps/services` | Transactional email delivery. Accessed exclusively through the `EmailNotifier` port defined in `@repo/types`; the `SesEmailNotifier` adapter in `apps/services/src/modules/notifications/providers/` (via `@aws-sdk/client-sesv2`) is the only concrete implementation, resolved as a singleton by `resolveNotifier()`. Sends are in-process and fire-and-forget — no queue or separate worker. |

## Inter-service communication

`apps/web` calls `apps/services` over HTTP using the `VITE_API_URL` environment variable as the base URL. All calls are routed through `api/client.ts` (`apiFetch`). In development `VITE_API_URL` defaults to `http://localhost:3000`; in production it points to the backend's DigitalOcean App Platform public URL (INFRA-008; see `duck-spec/docs/INFRASTRUCTURE.md`), not the previously planned App Runner URL.

Authenticated requests include an `Authorization: Bearer <token>` header. `api/client.ts` reads the token from `useSessionStore.token()`, which wraps Clerk's `getToken()`. `apps/services` verifies the token in a global `onRequest` hook before any route handler runs.

Since `apps/web` and `apps/landing` are each served from their own Cloudflare Pages public URL (INFRA-009), `apps/services`' `serverConfig.corsOrigin` accepts a comma-separated `CORS_ORIGIN` value and resolves it to a `string[]` so `@fastify/cors` matches either origin; a single value (including the `'*'` default) is unaffected.

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
