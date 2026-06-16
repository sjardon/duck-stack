# infra — Living Specification

Módulo de infraestructura y tooling. Cubre la configuración base del monorepo, pipelines de build, y paquetes compartidos de configuración y schemas.

---

## Monorepo Scaffolding (INFRA-001)

The repository is a pnpm + Turborepo monorepo. All workspaces are declared under two top-level directories: `apps/` for application packages and `packages/` for shared tooling and domain packages.

### Applications

| App | Stack | Dev script |
|-----|-------|------------|
| `apps/web` | Vite + React + TypeScript | `vite` |
| `apps/landing` | Vite + React + TypeScript | `vite` |
| `apps/services` | Fastify + TypeScript | `tsx watch src/index.ts` |

Each application is runnable independently via `pnpm dev` from its own workspace directory.

`apps/services` exposes a single GET `/health` route that returns `{ "status": "ok" }`.

### Shared packages

| Package | Name | Purpose |
|---------|------|---------|
| `packages/tsconfig` | `@repo/tsconfig` | Base TypeScript configuration (`base.json`) extended by all workspaces. Enables `strict`, `ESNext` target, `Bundler` module resolution, and declaration map emission. |
| `packages/eslint-config` | `@repo/eslint-config` | Shared ESLint rules (CommonJS) with TypeScript support. Consumed via `require("@repo/eslint-config")` in each workspace's `.eslintrc.cjs`. |
| `packages/types` | `@repo/types` | Pure TypeScript domain interfaces shared across apps. Has zero runtime dependencies; the `types` field in its `package.json` points directly at `src/index.ts`. |

### Turborepo pipeline

The root `turbo.json` defines three pipeline tasks:

| Task | dependsOn | cache | Notes |
|------|-----------|-------|-------|
| `build` | `["^build"]` | yes | Compiles all apps in dependency order (packages before apps). |
| `dev` | — | no | Persistent; all dev servers start in parallel. A single app failure does not abort others. |
| `lint` | — | yes | Runs ESLint across all workspaces. |

Running `pnpm build` from the repository root compiles every workspace in correct dependency order via Turborepo's `^build` dependency resolution.

### TypeScript configuration

All workspaces extend `@repo/tsconfig/base.json`, which sets `"strict": true`. `apps/services` overrides `module` and `moduleResolution` to `NodeNext` for Node.js compatibility. Frontend apps use `Bundler` resolution (inherited from base).

### Workspace dependency resolution

Each app declares workspace dependencies using the `workspace:*` protocol in `package.json`. pnpm resolves these to live symlinks, ensuring shared package changes are reflected without reinstallation.
