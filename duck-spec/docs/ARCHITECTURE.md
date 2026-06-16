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
| `apps/web` | Vite + React + TypeScript | Main SPA for authenticated users |
| `apps/landing` | Vite + React + TypeScript | Public marketing SPA |
| `apps/services` | Fastify + TypeScript | Backend API. Containerised; deployed to AWS App Runner via ECR. |

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
