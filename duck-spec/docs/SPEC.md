# duck-stack — Global Specification

Living index of the functional state of each module. For the full specification of a module see `duck-spec/modules/<module>/SPEC.md`.

---

## infra

**Status:** Base monorepo scaffolded.

The repository is a pnpm + Turborepo monorepo. It contains three applications (`apps/web`, `apps/landing`, `apps/services`) and three shared packages (`@repo/tsconfig`, `@repo/eslint-config`, `@repo/types`). The Turborepo pipeline coordinates `build`, `dev`, and `lint` across all workspaces in dependency order.

See `duck-spec/modules/infra/SPEC.md` for full details.

---

## services

**Status:** Fastify base structure in place.

`apps/services` exposes a `GET /health` endpoint and implements a simplified hexagonal architecture with vertical slicing. Shared infrastructure (logger, Supabase client, error handler, CORS, helmet) is wired once in `src/app.ts`; feature modules register routes as Fastify plugins.

See `duck-spec/modules/services/SPEC.md` for full details.
