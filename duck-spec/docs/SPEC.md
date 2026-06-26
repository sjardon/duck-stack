# duck-stack — Global Specification

Living index of the functional state of each module. For the full specification of a module see `duck-spec/modules/<module>/SPEC.md`.

---

## infra

**Status:** Base monorepo scaffolded.

The repository is a pnpm + Turborepo monorepo. It contains three applications (`apps/web`, `apps/landing`, `apps/services`) and three shared packages (`@repo/tsconfig`, `@repo/eslint-config`, `@repo/types`). The Turborepo pipeline coordinates `build`, `dev`, and `lint` across all workspaces in dependency order.

See `duck-spec/modules/infra/SPEC.md` for full details.

---

## web

**Status:** Base structure in place.

`apps/web` is a Vite + React + TypeScript SPA organised into strict layer directories (`api/`, `hooks/`, `pages/`, `components/ui/`, `components/domain/`, `store/`, `lib/`). The entry point wires React Query via `QueryClientProvider` and two Zustand stores (`useSessionStore`, `useUiStore`) are available for session and UI state. A shared HTTP client (`api/client.ts`) wraps `fetch` with an optional auth-header placeholder. A working health-check vertical slice (`api/health.ts` → `hooks/useHealth.ts` → `pages/health/HealthPage.tsx`) serves as the canonical layering reference.

See `duck-spec/modules/web/SPEC.md` for full details.

---

## landing

**Status:** Base structure in place.

`apps/landing` is a Vite + React + TypeScript marketing SPA. Its source is organised into `components/layout/`, `components/sections/`, `components/ui/`, `pages/`, `api/`, and `lib/`. Layout components (`Navbar`, `Footer`) and three independent marketing sections (`Hero`, `Features`, `CTA`) are composed into a single `HomePage` rendered at `/`. UI primitives (`Button`, `Badge`) have no dependencies beyond React. A stub `api/contact.ts` resolves without a network call. React Router handles routing with a catch-all redirect to `/` for unknown paths.

See `duck-spec/modules/landing/SPEC.md` for full details.

---

## services

**Status:** Fastify base structure in place; postgres.js direct database client in use; environment configuration centralized under typed config objects; file naming normalized to lowercase camelCase throughout; request-scoped `requestId` propagated to all log lines via AsyncLocalStorage mixin; error model foundation in place with `originalError` support and centralized logging in `errorHandler`; all repositories and the mobbex provider adapter are fully try/catch compliant; orchestration layer (handlers, webhook routes, use cases, plugins) fully compliant with the three-outcome error rule — all HTTP error serialization delegated to `errorHandler`.

`apps/services` exposes a `GET /health` endpoint and implements a simplified hexagonal architecture with vertical slicing. Shared infrastructure (logger, postgres.js client, error handler, CORS, helmet) is wired once in `src/app.ts`; feature modules register routes as Fastify plugins. All database operations run via a `postgres.js` singleton (`shared/infrastructure/db.ts`) connected to Postgres over TCP — no HTTP intermediary. `@supabase/supabase-js` is not a runtime dependency. All environment variables are consumed through typed configuration objects under `src/shared/configs/` (`serverConfig.ts`, `authConfig.ts`, `mobbexConfig.ts`); no application code reads `process.env` directly except the two documented bootstrap exceptions (`db.ts` for `DATABASE_URL` and `clerkAuthPlugin` for `CLERK_SECRET_KEY`). Every file under `src/` uses lowercase camelCase naming with no dot-separated suffixes (other than `.ts` and `.test.ts`) and no hyphens — plugin, entity, and DTO files all conform to this convention. The static Pino logger from `shared/infrastructure/logger.ts` is the only shared logger instance; a Pino `mixin` backed by `AsyncLocalStorage` automatically injects `requestId` into every log line emitted during an HTTP request, while logs outside a request scope are unaffected. Every external call in all six database repositories (`UserDBRepository`, `SubscriptionDBRepository`, `SubscriptionPlanDBRepository`, `TransactionDBRepository`, `ClerkSyncRepository`, `MobbexBillingSyncRepository`) and in `MobbexProvider` is wrapped in a method-level `try/catch` that logs the original cause with repository and method context, attaches it as `originalError`, and re-throws a `ProviderError` — no Postgres or network failure escapes without first being logged at the call site. Every handler, webhook route, use case catch block, and plugin catch block in the orchestration layer ends in one of three outcomes (log + re-throw, log + transform, or log + handle with a justifying comment); no orchestration-layer site calls `reply.status()` directly — the `errorHandler` is the sole serialization point for all 4xx and 5xx responses. Every retained silent-fail is documented inline with a comment explaining why the failure is non-critical and why the caller can continue.

See `duck-spec/modules/services/SPEC.md` for full details.

---

## billing

**Status:** Payment provider port and Mobbex adapter implemented (BILLING-001). Checkout and transaction records implemented (BILLING-002). Payment webhooks implemented (BILLING-003). Refunds reflection implemented (BILLING-004).

The billing module exposes a `PaymentProvider` port in `@repo/types` with five operations: `createCheckout`, `queryTransaction`, `createSubscription`, `cancelSubscription`, and `verifyWebhook`. The active provider is resolved at boot time via `resolveProvider()` reading `BILLING_PROVIDER` (default `mobbex`); the service refuses to start if the provider is unknown or credentials are missing. `MobbexProvider` is the only implemented adapter, targeting the Mobbex HTTP API (Argentina/LATAM market). Provider errors are mapped to `ProviderError` (`statusCode 502` for upstream failures, `400` for validation errors).

The `transactions` Supabase table persists all payment attempts with columns for `id` (uuid PK, also used as the provider `reference`), `user_id`, `org_id`, `provider`, `provider_transaction_id`, `amount`, `currency`, `status` (`pending` | `approved` | `failed` | `refunded`), `description`, `reference` (unique), `checkout_url`, `metadata`, `failure_reason`, `created_at`, and `updated_at`. Three authenticated endpoints are exposed: `POST /billing/checkout` creates a pending transaction row before calling the provider and returns `{ checkoutUrl, transactionId }`; `GET /billing/transactions/:id` returns the full transaction record for the owning user or org; `GET /billing/transactions` returns a cursor-paginated list ordered by `created_at DESC`. All three routes enforce authentication via the `requireAuth` preHandler. The local transaction `id` serves as the end-to-end idempotency key sent as `reference` to the provider. An optional `Idempotency-Key` request header enables safe retries — if a matching transaction exists for the requester, the existing record is returned without a new DB write or provider call. Transactions are scoped to the authenticated `user_id`; when the JWT carries `orgId` the transaction is also associated with `org_id`. Input validation uses Zod (`amount > 0`, `currency` in `['ARS', 'USD']`, `description` non-empty); the listing endpoint accepts `limit` (default 20, max 100) and cursor-based pagination via a `cursor` query parameter encoding a `(created_at, id)` pair. Shared types `Transaction`, `TransactionStatusValue`, `CreateCheckoutInput`, and `TransactionListResponse` are exported from `@repo/types`. A frontend API client in `apps/web/src/api/billing.ts` exposes `createCheckout`, `getTransaction`, and `listTransactions` functions using `apiFetch`.

`POST /webhooks/billing/mobbex` receives asynchronous payment outcome notifications from Mobbex. The endpoint is registered before `clerkAuthPlugin` and is not subject to JWT verification. Authenticity is enforced via a `?secret=` query parameter compared against `MOBBEX_WEBHOOK_SECRET`; the plugin throws at registration time if the variable is absent. Every verified event is persisted in the `billing_webhook_events` Supabase table (`id`, `provider`, `event_type`, `payload` jsonb, `received_at`, `transaction_id` nullable FK, `subscription_id` nullable reserved for future use). On receipt of a checkout success or failure event, the handler resolves the local transaction by `provider_transaction_id` (falling back to `reference`) and updates `transactions.status` to `approved` or `failed`. On receipt of a `refund.success` or `refund.failure` event, the dispatcher calls `MobbexBillingSyncRepository.upsertRefundAndMaybeMarkTransactionRefunded`, which upserts a row in the `refunds` table keyed by `provider_refund_id` and — if the cumulative approved-refund amount equals the parent transaction amount — atomically transitions `transactions.status` to `refunded` within a single `sql.begin` block. Status updates are idempotent throughout: duplicate events produce no inconsistent state. If no matching transaction is found, the event is still recorded with `transaction_id = NULL` and the endpoint returns HTTP 200. All database access is centralized in `MobbexBillingSyncRepository` under `src/modules/webhooks/repositories/`.

The `refunds` Supabase table persists every provider-reported refund event with columns `id` (uuid PK), `transaction_id` (FK → `transactions.id` ON DELETE CASCADE), `amount`, `reason` (nullable), `status` (`pending` | `approved` | `failed`), `provider_refund_id` (UNIQUE), `created_at`, and `updated_at`. `GET /billing/transactions/:id/refunds` (authenticated via `requireAuth`) returns the refunds for a transaction ordered by `created_at ASC`; it returns 404 if the transaction does not exist and 403 if it belongs to a different scope. No endpoint in this module triggers a refund against the provider — refund creation flows exclusively from provider-initiated webhook events. Shared types `RefundStatusValue` and `Refund` are exported from `@repo/types`.

See `duck-spec/modules/billing/SPEC.md` for full details.

---

## subscriptions

**Status:** Plans catalog implemented (SUBS-001). Subscribe/cancel flow implemented (SUBS-002). Lifecycle webhooks implemented (SUBS-003). Pricing page and billing settings UI implemented (SUBS-004). Entitlements and feature gates implemented (SUBS-005).

The module exposes `GET /billing/plans` (no auth required), which returns the active subscription plan catalog ordered by price ascending. Plans are persisted in the `subscription_plans` Supabase table and seeded with three entries: `free` (price `0`), `pro`, and `business`. Each plan carries a nullable `provider_plan_id` for linkage to the external payment provider. Three authenticated endpoints manage the subscription lifecycle: `POST /billing/subscriptions` creates a subscription for the scope (short-circuiting provider calls for the free plan and returning a `checkoutUrl` for paid plans), `POST /billing/subscriptions/:id/cancel` cancels a subscription immediately or at period end, and `GET /billing/subscriptions/me` returns the current non-terminal subscription or `null`. Subscriptions are persisted in the `subscriptions` Supabase table; partial unique indexes enforce at most one active subscription per scope. Provider interaction goes through the abstract billing port (`resolveProvider()`). Shared types `SubscriptionPlan`, `Subscription`, `CreateSubscriptionInput`, `CancelSubscriptionInput`, and `SubscriptionStatusValue` are published from `@repo/types`.

The module defines a code-level `plan.code → EntitlementName[]` mapping in `entitlements.ts`. `GET /billing/entitlements/me` (authenticated) returns the entitlements resolved from the scope's active subscription, falling back to the `free` plan when no subscription exists. The `requireEntitlement(name)` preHandler factory gates backend routes by entitlement name and caches the resolved entitlement array on `request.entitlements` for the lifetime of the request to avoid redundant database queries. A `canceled` subscription continues to grant its plan's entitlements until `current_period_end` elapses; `past_due` subscriptions retain entitlements unless `STRICT_ENTITLEMENTS_ON_PAST_DUE=true`. On the frontend, `useEntitlement(name)` and `<EntitlementGate name="...">` consume `GET /billing/entitlements/me` via a shared React Query cache entry (5-minute staleTime) and render children or an upgrade CTA fallback respectively.

See `duck-spec/modules/subscriptions/SPEC.md` for full details.

---

## auth

**Status:** Clerk integration implemented; Supabase schema and webhook sync in place; user profile endpoints and page implemented; mandatory onboarding gate implemented.

Clerk is the end-to-end identity provider. `apps/web` renders Clerk's `<SignIn />`, `<SignUp />`, `<CreateOrganization />`, and `<OrganizationProfile />` components at their respective routes. An `AuthGuard` component redirects unauthenticated users to `/sign-in` and gates all protected routes on onboarding completion. `useCurrentUser` and `useCurrentOrg` hooks wrap Clerk's `useUser` and `useOrganization`. `apps/services` verifies Clerk JWTs locally via a global Fastify plugin (`clerk-auth.plugin.ts`) using a cached JWKS key — no per-request Clerk API call. Requests are decorated with `userId` and `orgId`; `requireAuth` and `requireOrg` preHandlers enforce 401/403 at the route level. Organization multi-tenancy is opt-in: no route requires `orgId` at the starter level. Supabase holds local mirrors of Clerk identity data in three tables (`users`, `organizations`, `organization_members`), kept in sync via `POST /webhooks/clerk` in `apps/services` — a Svix-verified webhook endpoint that handles `user.created`, `user.updated`, `organization.created`, and `organizationMembership.created` events with idempotent upsert semantics. `GET /users/me` returns the full user profile including `job_role`, `company_size`, `primary_use_case`, and `onboarding_completed`. `PATCH /users/me` accepts only `locale` and `timezone`. `POST /users/me/onboarding` atomically persists the three segmentation fields and sets `onboarding_completed = true`. A `/profile` page and an `/onboarding` page in `apps/web` handle profile editing and first-access onboarding respectively; `AuthGuard` redirects users with `onboarding_completed = false` to `/onboarding` before rendering any other protected page.

See `duck-spec/modules/auth/SPEC.md` for full details.
