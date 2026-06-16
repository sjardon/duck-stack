# Architecture

Living document describing the infrastructure, service topology, and cross-cutting technical decisions of duck-stack.

---

## Monorepo structure

The repository is a pnpm workspace monorepo orchestrated by Turborepo.

```
/
├── package.json            ← root package (private), defines build/dev/lint scripts via turbo
├── pnpm-workspace.yaml     ← workspace globs: apps/*, packages/*
├── turbo.json              ← Turborepo pipeline
├── .gitignore
├── apps/
│   ├── web/                ← Vite + React + TypeScript SPA (main application)
│   ├── landing/            ← Vite + React + TypeScript SPA (marketing / landing pages)
│   └── services/           ← Fastify + TypeScript backend API
└── packages/
    ├── tsconfig/           ← @repo/tsconfig  — shared TypeScript base config
    ├── eslint-config/      ← @repo/eslint-config — shared ESLint rules
    └── types/              ← @repo/types — shared TypeScript domain interfaces
```

## Services

| Service | Technology | Role |
|---------|-----------|------|
| `apps/web` | Vite + React + TypeScript | Main SPA served to authenticated users |
| `apps/landing` | Vite + React + TypeScript | Public marketing SPA |
| `apps/services` | Fastify + TypeScript | Backend API; exposes `/health` |

## Shared packages

| Package | Name | Role |
|---------|------|------|
| `packages/tsconfig` | `@repo/tsconfig` | Base TypeScript config (`strict`, `ESNext`, declaration maps) consumed by all workspaces |
| `packages/eslint-config` | `@repo/eslint-config` | Shared ESLint rules with TypeScript support |
| `packages/types` | `@repo/types` | Pure TypeScript domain interfaces; zero runtime dependencies |

## Turborepo pipeline

Defined in `turbo.json` at the repository root.

| Task | dependsOn | cache | Behaviour |
|------|-----------|-------|-----------|
| `build` | `["^build"]` | yes | Compiles all workspaces; packages build before apps (upstream dependency order). |
| `dev` | — | no | Persistent task; all dev servers start in parallel. One app failure does not abort others. |
| `lint` | — | yes | ESLint across all workspaces. |

Root `package.json` scripts delegate to turbo: `pnpm build`, `pnpm dev`, `pnpm lint`.

## TypeScript strategy

All workspaces extend `@repo/tsconfig/base.json`, which enforces `strict: true`, `target: ESNext`, and `moduleResolution: Bundler`. `apps/services` overrides `module` and `moduleResolution` to `NodeNext` for Node.js compatibility.

## Dependency resolution

Workspace inter-dependencies use the pnpm `workspace:*` protocol, which resolves to live symlinks. Changes to a shared package are immediately visible to dependent apps without reinstallation.
