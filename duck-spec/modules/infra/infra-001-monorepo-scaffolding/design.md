# INFRA-001 — Monorepo Scaffolding: Design

## Problem statement

The repository is currently empty and needs a base monorepo structure to support three application layers: a React frontend (`web`), a landing-page frontend (`landing`), and a Fastify backend (`services`). Shared configuration and domain-type packages must be consumable by all apps through pnpm workspaces, and the Turborepo task pipeline must coordinate `build`, `dev`, and `lint` across every workspace in dependency order.

## Alternatives

| Name | Description | Decision |
|------|-------------|----------|
| create-turbo scaffold | Use the `create-turbo` CLI to bootstrap the monorepo then adapt it to the required apps and packages. | Not chosen — the default template targets Next.js and emits `@repo/ui`, requiring large-scale deletion and a bundler swap; the effort to de-template exceeds the effort to write from scratch, and the out-of-scope `@repo/ui` package would be introduced. |
| Manual pnpm workspace + Turborepo from scratch | Hand-author every config file and scaffold each app with its own CLI (`vite create` / Fastify init), producing exactly the files listed in scope and nothing more. | Chosen — matches all technical constraints exactly, every file is purposeful and auditable, no extraneous scaffolding. |
| Nx + pnpm | Use Nx as the monorepo orchestrator with pnpm for package management. | Not chosen — violates the hard technical constraint that Turborepo is the monorepo orchestrator (R001). |

## Chosen solution

**Manual pnpm workspace + Turborepo from scratch.**

Justification: satisfies R001 (pnpm workspaces + Turborepo), R002/R003 (Vite+React+TS apps), R004 (Fastify+TS app), R005/R006/R007 (shared packages with no extra deps), R008 (turbo.json pipeline), NF001 (each app is self-contained), NF002 (pipeline respects dependency order), NF003 (strict TypeScript everywhere). No scaffolding tool is used that would introduce out-of-scope files.

## Technical design

### Repository layout

```
/                               ← repo root
├── package.json                ← root package, private, workspaces
├── pnpm-workspace.yaml         ← workspace globs: apps/*, packages/*
├── turbo.json                  ← pipeline: build, dev, lint
├── .gitignore
├── apps/
│   ├── web/                    ← Vite + React + TS
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .eslintrc.cjs
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       └── App.tsx
│   ├── landing/                ← Vite + React + TS
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .eslintrc.cjs
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       └── App.tsx
│   └── services/               ← Fastify + TS
│       ├── package.json
│       ├── tsconfig.json
│       ├── .eslintrc.cjs
│       └── src/
│           └── index.ts
└── packages/
    ├── tsconfig/               ← @repo/tsconfig
    │   ├── package.json
    │   └── base.json
    ├── eslint-config/          ← @repo/eslint-config
    │   ├── package.json
    │   └── index.cjs
    └── types/                  ← @repo/types
        ├── package.json
        └── src/
            └── index.ts
```

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Root package.json

- `"private": true`
- `"name": "duck-stack"`
- `"packageManager": "pnpm@<version>"`
- `scripts`: `{ "build": "turbo build", "dev": "turbo dev", "lint": "turbo lint" }`
- `devDependencies`: `turbo`

### turbo.json

Pipeline tasks:

| Task | dependsOn | outputs | cache |
|------|-----------|---------|-------|
| `build` | `["^build"]` | `["dist/**"]` | true |
| `dev` | — | — | false (persistent) |
| `lint` | — | — | true |

`dev` is marked `"persistent": true` so Turborepo does not consider it completed and does not abort parallel dev tasks on individual failure (satisfies EC002).

### @repo/tsconfig (packages/tsconfig)

`base.json` — base TypeScript config extended by all workspaces:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`package.json` fields: `"name": "@repo/tsconfig"`, `"exports": { "./base.json": "./base.json" }`, no `build` script needed (JSON only), `"private": false`.

### @repo/eslint-config (packages/eslint-config)

`index.cjs` exports a CommonJS ESLint config object with rules for TypeScript. Consumers extend it via `require("@repo/eslint-config")`.

`package.json`: `"name": "@repo/eslint-config"`, `"main": "index.cjs"`, devDependencies: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`.

### @repo/types (packages/types)

`src/index.ts` — exports pure TypeScript interfaces only; zero runtime dependencies (satisfies R007, EC003).

`package.json`: `"name": "@repo/types"`, `"types": "src/index.ts"`, `"private": false`, no `dependencies` field.

### apps/web and apps/landing

Each extends `@repo/tsconfig/base.json` via `tsconfig.json`. Both reference `@repo/eslint-config` via `.eslintrc.cjs`. Dependencies: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`. The `dev` script is `vite`, `build` script is `vite build`, `lint` script is `eslint src`.

### apps/services

`tsconfig.json` extends `@repo/tsconfig/base.json` with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` overrides for Node.js compatibility. Dependencies: `fastify`, `typescript`. Dev dependencies: `tsx` (for `dev` script). Scripts: `dev: tsx watch src/index.ts`, `build: tsc`, `lint: eslint src`.

`src/index.ts` — creates and starts a minimal Fastify server on port 3000 with a single GET `/health` route returning `{ status: "ok" }`.

## Files

| Action | Path |
|--------|------|
| CREATE | `package.json` |
| CREATE | `pnpm-workspace.yaml` |
| CREATE | `turbo.json` |
| CREATE | `.gitignore` |
| CREATE | `apps/web/package.json` |
| CREATE | `apps/web/tsconfig.json` |
| CREATE | `apps/web/.eslintrc.cjs` |
| CREATE | `apps/web/vite.config.ts` |
| CREATE | `apps/web/src/main.tsx` |
| CREATE | `apps/web/src/App.tsx` |
| CREATE | `apps/landing/package.json` |
| CREATE | `apps/landing/tsconfig.json` |
| CREATE | `apps/landing/.eslintrc.cjs` |
| CREATE | `apps/landing/vite.config.ts` |
| CREATE | `apps/landing/src/main.tsx` |
| CREATE | `apps/landing/src/App.tsx` |
| CREATE | `apps/services/package.json` |
| CREATE | `apps/services/tsconfig.json` |
| CREATE | `apps/services/.eslintrc.cjs` |
| CREATE | `apps/services/src/index.ts` |
| CREATE | `packages/tsconfig/package.json` |
| CREATE | `packages/tsconfig/base.json` |
| CREATE | `packages/eslint-config/package.json` |
| CREATE | `packages/eslint-config/index.cjs` |
| CREATE | `packages/types/package.json` |
| CREATE | `packages/types/src/index.ts` |

## Requirement coverage

| ID | Design decision |
|----|----------------|
| R001 | `pnpm-workspace.yaml` declares workspace globs; `turbo.json` and root `package.json` wire Turborepo as the orchestrator. |
| R002 | `apps/web/` scaffolded with Vite, React, and TypeScript; `package.json` lists `vite`, `react`, `react-dom`, `@vitejs/plugin-react`. |
| R003 | `apps/landing/` scaffolded identically to `apps/web/` with Vite, React, and TypeScript. |
| R004 | `apps/services/` scaffolded with Fastify and TypeScript; `src/index.ts` creates a Fastify server. |
| R005 | `packages/tsconfig/base.json` provides the base TS config; exported via `package.json` `exports` map so all workspaces can extend it. |
| R006 | `packages/eslint-config/index.cjs` provides shared ESLint rules; exported via `package.json` `main` so all workspaces can require it. |
| R007 | `packages/types/src/index.ts` contains only TypeScript interfaces; `package.json` declares zero `dependencies`. |
| R008 | `turbo.json` pipeline defines `build`, `dev`, and `lint` tasks with correct `dependsOn` and `outputs`. |
| NF001 | Each app's `package.json` has its own `dev` script (`vite` or `tsx watch`) runnable independently. |
| NF002 | `turbo.json` `build` task sets `dependsOn: ["^build"]`, ensuring packages build before apps. |
| NF003 | `packages/tsconfig/base.json` sets `"strict": true`; all `tsconfig.json` files extend it, enforcing strict mode everywhere. |
| EC001 | pnpm workspace protocol (`workspace:*`) in each app's `package.json` ensures live symlink resolution of shared packages without reinstallation. |
| EC002 | `turbo.json` marks `dev` as `"persistent": true`, so Turborepo runs all dev tasks in parallel and does not abort others on individual failure. |
| EC003 | `@repo/types` `package.json` points `types` directly at `src/index.ts` with no build step and no runtime dependencies, so imports resolve to pure TypeScript interfaces. |
