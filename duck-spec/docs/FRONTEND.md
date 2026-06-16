# Frontend

Living document describing frontend conventions, components, and design system decisions for duck-stack.

---

## Stack

| Concern | Choice |
|---------|--------|
| Bundler | Vite |
| UI library | React |
| Language | TypeScript (strict mode via `@repo/tsconfig`) |
| Module resolution | `Bundler` (Vite-compatible, inherited from `@repo/tsconfig/base.json`) |
| Lint | ESLint via `@repo/eslint-config` |

## Applications

| App | Purpose |
|-----|---------|
| `apps/web` | Main SPA for authenticated users |
| `apps/landing` | Public marketing / landing pages SPA |

Both applications share the same structure: `vite.config.ts`, `tsconfig.json` extending `@repo/tsconfig/base.json`, `.eslintrc.cjs` requiring `@repo/eslint-config`, and a `src/` directory with `main.tsx` and `App.tsx`.

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `vite` — local dev server with HMR |
| `build` | `vite build` — production bundle to `dist/` |
| `lint` | `eslint src` |

## Shared domain types

Frontend apps import shared TypeScript interfaces from `@repo/types` via the pnpm workspace link. The package exposes only TypeScript interfaces with no runtime dependencies.
