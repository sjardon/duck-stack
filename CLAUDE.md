# duck-stack

A SaaS starter pack providing the foundational features every product needs: auth, subscriptions, payments, and more. Intended as a reusable base for new SaaS projects.

## Monorepo structure

pnpm workspace managed by Turborepo.

```
/
├── apps/
│   ├── web/           ← Main SPA (authenticated users) — Vite + React + TypeScript
│   ├── landing/       ← Marketing SPA — Vite + React + TypeScript
│   └── services/      ← Backend API — Fastify + TypeScript
└── packages/
    ├── tsconfig/      ← @repo/tsconfig — shared TypeScript base config
    ├── eslint-config/ ← @repo/eslint-config — shared ESLint rules
    └── types/         ← @repo/types — shared domain interfaces (no runtime deps)
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers in parallel |
| `pnpm build` | Build all workspaces in dependency order |
| `pnpm lint` | Lint all workspaces |
| `pnpm --filter <app> <script>` | Run a script for a single workspace |

## Documentation

Read these files when the task touches the relevant area — do not read them all upfront:

| When working on… | Read |
|------------------|------|
| Monorepo, Turborepo, TypeScript strategy, inter-service topology | `duck-spec/docs/ARCHITECTURE.md` |
| AWS resources, Terraform, CI/CD, deployment topology | `duck-spec/docs/INFRASTRUCTURE.md` |
| Backend (`apps/services`), Fastify, API routes, domain errors, logging | `duck-spec/docs/BACKEND.md` |
| Frontend (`apps/web`, `apps/landing`), React, Vite, component conventions | `duck-spec/docs/FRONTEND.md` |
| Current functional state of any module, what is implemented vs. planned | `duck-spec/docs/SPEC.md` |

## duck-spec workflow

This project uses the duck-spec structured development workflow. See `duck-spec/CLAUDE.md`.
