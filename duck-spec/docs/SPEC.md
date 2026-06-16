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

## services

**Status:** Fastify base structure in place.

`apps/services` exposes a `GET /health` endpoint and implements a simplified hexagonal architecture with vertical slicing. Shared infrastructure (logger, Supabase client, error handler, CORS, helmet) is wired once in `src/app.ts`; feature modules register routes as Fastify plugins.

See `duck-spec/modules/services/SPEC.md` for full details.
