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
| `apps/services` worker | Node.js + TypeScript (`src/worker.ts`) | Standalone background worker process (notifications email delivery). Deployable and scalable independently of the API; shares the `apps/services` codebase and config but has its own entrypoint and no HTTP listener. |

## External integrations

| Integration | Service | Role |
|-------------|---------|------|
| Clerk | `apps/web`, `apps/services` | End-to-end identity provider. `apps/web` manages user sessions via `@clerk/clerk-react`. `apps/services` verifies Clerk JWTs locally via `@clerk/backend` (JWKS cached at startup; no per-request Clerk API call for verification). Clerk also delivers lifecycle events (user and organization create/update) to `apps/services` via webhook. `apps/services` writes back to Clerk on the `user.created`/`organization.created` webhook (and, as a lazy fallback, from `clerkAuthPlugin`) via `clerkClient.users.updateUserMetadata`/`organizations.updateOrganizationMetadata`, storing the internal `users.id`/`organizations.id` UUID in `private_metadata` so it is available as a custom JWT claim (`app_user_id`/`app_org_id`) on subsequent requests. |
| Supabase | `apps/services` | Relational database. `apps/services` connects via `postgres.js` over a direct TCP connection using `DATABASE_URL`. Schema migrations are managed with the Supabase CLI under `apps/services/supabase/migrations/`. |
| Mobbex | `apps/services` | Payment provider (Argentina/LATAM market). Accessed exclusively through the `PaymentProvider` port defined in `@repo/types`; the `MobbexProvider` adapter in `apps/services/src/modules/billing/providers/` is the only concrete implementation. No other module imports from the adapter directly. |
| AWS SQS | `apps/services` | Transactional-email async delivery queue. The API enqueues via `SqsEmailNotifier` (`modules/notifications/providers/`); the standalone worker process long-polls the same queue and forwards permanent-error messages to a dedicated dead-letter queue. Transient retries and DLQ overflow past the DLQ forward are handled by the queue's own redrive policy (external infrastructure, not Terraform-managed by this repo yet). |
| AWS SES | `apps/services` worker | Transactional email provider. Accessed exclusively through the `IEmailSender` port; `SesEmailSender` (`modules/notifications/providers/`) is the only concrete implementation and is called only by the worker, never by the API request path. |
| AWS SNS | `apps/services` | Delivers SES delivery/bounce/complaint/reject event notifications to `POST /webhooks/notifications/ses` (`modules/webhooks/ses/`). Notification authenticity is verified via `sns-validator` (AWS's official signature-verification mechanism) plus a `TopicArn` equality check, following the same "webhook module" registration and fail-fast-config conventions as the Clerk and Mobbex webhooks. |

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
