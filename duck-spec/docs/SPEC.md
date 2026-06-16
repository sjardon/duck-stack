# duck-stack — Global Specification

Living index of the functional state of each module. For the full specification of a module see `duck-spec/modules/<module>/SPEC.md`.

---

## infra

**Status:** Base monorepo scaffolded.

The repository is a pnpm + Turborepo monorepo. It contains three applications (`apps/web`, `apps/landing`, `apps/services`) and three shared packages (`@repo/tsconfig`, `@repo/eslint-config`, `@repo/types`). The Turborepo pipeline coordinates `build`, `dev`, and `lint` across all workspaces in dependency order.

See `duck-spec/modules/infra/SPEC.md` for full details.
