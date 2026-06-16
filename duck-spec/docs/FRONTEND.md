# Frontend

Living document describing frontend conventions, components, and design system decisions for duck-stack.

---

## Stack

| Concern | Choice |
|---------|--------|
| Bundler | Vite |
| UI library | React |
| Language | TypeScript (strict mode via `@repo/tsconfig`) |
| Module resolution | `Bundler` (inherited from `@repo/tsconfig/base.json`) |
| Lint | ESLint via `@repo/eslint-config` |

## Applications

| App | Purpose |
|-----|---------|
| `apps/web` | Main SPA for authenticated users |
| `apps/landing` | Public marketing / landing pages SPA |

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `vite` |
| `build` | `vite build` |
| `lint` | `eslint src` |

## Shared domain types

Frontend apps import shared TypeScript interfaces from `@repo/types` via the pnpm workspace link.
