# WEB-001 — Web App Base Structure — Analysis

## Reason for being

The monorepo has been scaffolded by INFRA-001 and the `web` app currently exists as an empty Vite + React + TypeScript project. Before any domain feature (auth, dashboard, billing, etc.) can be added, the frontend needs a well-defined layered architecture so that every future feature plugs into a consistent, predictable structure.

The objective is to establish the base structure of the `web` app with strict layering (api, hooks, components, pages, store, lib), React Query for server-state, and Zustand for client-state. The base must be ready to receive domain features and must include a fully working end-to-end example (health check) that validates the chosen patterns from HTTP call through hook through page render.

## Scope

Base architecture and bootstrap code for the `apps/web` React SPA:
- Layered folder structure (`pages/`, `components/ui/`, `components/domain/`, `api/`, `hooks/`, `store/`, `lib/`).
- Shared HTTP client (`api/client.ts`) with a placeholder for the auth header so future auth features can plug in.
- React Query setup wired in `main.tsx` via `QueryClientProvider`.
- Two Zustand stores (`session.store.ts`, `ui.store.ts`) with empty but extensible base shapes.
- Library helpers: `lib/formatters.ts` (`formatDate`, `formatCurrency` stubs) and `lib/utils.ts` (generic, non-React helpers).
- End-to-end example: `api/health.ts` + `hooks/useHealth.ts` + `pages/health/HealthPage.tsx` that consumes the `services` `/health` endpoint and demonstrates the layering contract.

## Out of scope

- Domain-specific business components.
- Design system (CSS tokens, typography, colour palette).
- Real authentication and session handling (handled by a separate feature).
- Routing beyond the minimum required to render the health-check example.

## Functional requirements

| ID   | Requirement |
|------|-------------|
| R001 | The system shall organise the `apps/web/src` codebase into the following layer folders: `pages/`, `components/ui/`, `components/domain/`, `api/`, `hooks/`, `store/`, `lib/`. |
| R002 | The system shall provide an `api/client.ts` module that exposes a base HTTP client wrapping the native `fetch` API and reserves a placeholder for an auth header to be populated by future auth features. |
| R003 | The system shall configure a React Query `QueryClient` and wrap the application root in `main.tsx` with `QueryClientProvider` so that any component or hook can use React Query. |
| R004 | The system shall expose a Zustand store at `store/session.store.ts` for user session data, with an empty but extensible base shape. |
| R005 | The system shall expose a Zustand store at `store/ui.store.ts` for global UI state, with an empty but extensible base shape. |
| R006 | The system shall provide a `lib/formatters.ts` module that exports `formatDate` and `formatCurrency` stub functions. |
| R007 | The system shall provide a `lib/utils.ts` module that exports generic helpers free of React dependencies. |
| R008 | The system shall provide an `api/health.ts` module that calls the backend `/health` endpoint through `api/client.ts`. |
| R009 | The system shall provide a `hooks/useHealth.ts` hook that wraps the `api/health.ts` call with React Query and exposes the query state to pages. |
| R010 | The system shall provide a `pages/health/HealthPage.tsx` page that consumes `useHealth` and renders the health-check result, serving as the reference end-to-end example of the layering contract. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NF001 | The system shall restrict calls to data-fetching hooks to page components only; non-page components must not invoke fetching hooks directly. |
| NF002 | The system shall ensure that components under `components/ui/` do not import from `@repo/types` and remain agnostic of any domain concept. |
| NF003 | The system shall ensure that components under `components/domain/` never call the API layer directly; they must receive data via props from pages. |
| NF004 | The system shall enforce a strict layering direction: `api` is consumed by `hooks`, `hooks` are consumed by `pages`, and `pages` compose `components`; no layer may invert this direction. |

## Edge cases

| ID    | Case |
|-------|------|
| EC001 | WHEN the backend `/health` endpoint is unreachable, the `useHealth` hook shall surface the error state through React Query so that `HealthPage` can render a non-crashing fallback. |
| EC002 | WHEN no auth token is available, the `api/client.ts` placeholder shall send the request without the auth header rather than throwing, so the base structure remains usable before auth is implemented. |

## Technical constraints

- Framework: Vite + React + TypeScript.
- Data fetching: React Query (`@tanstack/react-query`).
- Global state: Zustand.
- Domain types: `@repo/types` (pure TypeScript interfaces, no runtime deps).
- HTTP client: native `fetch` wrapped in `api/client.ts`.
- Architecture: strict layered direction — `api` → `hooks` → `pages` → `components`.

## Dependencies

- INFRA-001 — the `web` app must already exist in the monorepo.
- SERVICES-001 — the `/health` endpoint must exist in `apps/services` for the end-to-end example to function.

## Effort estimate

**high** — 10 functional requirements covering folder layout, HTTP client, React Query bootstrap, two Zustand stores, two library modules, and a full vertical example (api + hook + page); four non-functional requirements that codify strict layering boundaries the implementation must respect; two edge cases tied to error and auth-absent flows; and two upstream dependencies (INFRA-001 and SERVICES-001) that the base structure must integrate with.
