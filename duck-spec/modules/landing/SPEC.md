# landing — Module Specification

Living functional specification of the `apps/landing` SPA. Describes what the module currently does.

---

## Base structure (LANDING-001)

`apps/landing` is a Vite + React + TypeScript marketing SPA. Its `src/` directory is organised into six responsibility folders:

| Folder | Responsibility |
|--------|---------------|
| `components/layout/` | Structural chrome components (`Navbar`, `Footer`) shared across all pages |
| `components/sections/` | Independent marketing section blocks (`Hero`, `Features`, `CTA`) |
| `components/ui/` | Domain-agnostic UI primitives (`Button`, `Badge`) with no dependencies beyond React |
| `pages/` | Route-level composition components (`HomePage`) |
| `api/` | Network modules; currently a stub (`contact.ts`) that resolves without a real call |
| `lib/` | React-free generic helpers (`cn`, `noop` in `utils.ts`) |

The app exposes a single route (`/`) that renders `HomePage`, which composes `Navbar`, `Hero`, `Features`, `CTA`, and `Footer` in order. All unknown routes are redirected to `/` via a React Router catch-all, preventing crashes on unrecognised paths.

Marketing sections in `components/sections/` are stateless, accept no props, and have no cross-section imports, making them independently composable in any order within a page.

`components/ui/` primitives (`Button`, `Badge`) import only React and carry no external library dependencies.

The `api/contact.ts` module exports `submitContact`, which currently returns a resolved `Promise` without performing a real network call. This keeps the base structure functional before a backend contact endpoint exists.

React Query, Zustand, and domain types from `@repo/types` are intentionally absent from this app.
