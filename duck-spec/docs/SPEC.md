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

**Status:** Fastify base structure in place.

`apps/services` exposes a `GET /health` endpoint and implements a simplified hexagonal architecture with vertical slicing. Shared infrastructure (logger, Supabase client, error handler, CORS, helmet) is wired once in `src/app.ts`; feature modules register routes as Fastify plugins.

See `duck-spec/modules/services/SPEC.md` for full details.

---

## billing

**Status:** Planned — not yet implemented.

Four features designed: provider abstraction layer (port/adapter for multi-provider support), checkout & transaction records, payment webhooks, and refunds. Initial provider: Mobbex.

See `duck-spec/modules/billing/SPEC.md` for full details.

---

## subscriptions

**Status:** Planned — not yet implemented.

Five features designed: subscription plans (Supabase table + seed), subscribe/cancel flow, lifecycle webhooks (recurring payment events), frontend pricing page and billing settings, and entitlement gate (feature flags by plan). Depends on `billing` module for provider abstraction.

See `duck-spec/modules/subscriptions/SPEC.md` for full details.

---

## auth

**Status:** Clerk integration implemented; Supabase schema and webhook sync in place; user profile endpoints and page implemented.

Clerk is the end-to-end identity provider. `apps/web` renders Clerk's `<SignIn />`, `<SignUp />`, `<CreateOrganization />`, and `<OrganizationProfile />` components at their respective routes. An `AuthGuard` component redirects unauthenticated users to `/sign-in`. `useCurrentUser` and `useCurrentOrg` hooks wrap Clerk's `useUser` and `useOrganization`. `apps/services` verifies Clerk JWTs locally via a global Fastify plugin (`clerk-auth.plugin.ts`) using a cached JWKS key — no per-request Clerk API call. Requests are decorated with `userId` and `orgId`; `requireAuth` and `requireOrg` preHandlers enforce 401/403 at the route level. Organization multi-tenancy is opt-in: no route requires `orgId` at the starter level. Supabase holds local mirrors of Clerk identity data in three tables (`users`, `organizations`, `organization_members`), kept in sync via `POST /webhooks/clerk` in `apps/services` — a Svix-verified webhook endpoint that handles `user.created`, `user.updated`, `organization.created`, and `organizationMembership.created` events with idempotent upsert semantics. `GET /users/me` and `PATCH /users/me` expose the authenticated user's profile (name, email, avatar, locale, timezone); the `PATCH` endpoint accepts only `locale` and `timezone` (validated with Zod strict schema). A `/profile` page in `apps/web` renders the profile and provides a form to edit locale and timezone with success/error feedback via React Query.

See `duck-spec/modules/auth/SPEC.md` for full details.
