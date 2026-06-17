# LANDING-001 — Landing Base Structure — Analysis

## Reason for being

The monorepo has been scaffolded by INFRA-001 and the `landing` app currently exists as an empty Vite + React + TypeScript project. The landing is a marketing-oriented static SPA, simpler than `web`: it has no global state, no complex data fetching, and no business domain logic. Before any marketing section or content can be added, the app needs a well-defined structure so that future sections plug into a consistent layout.

The objective is to establish the base structure of the `landing` app with a simple architecture oriented to marketing pages, ready to receive product sections and content. This base intentionally avoids React Query, Zustand, and domain types — the trade-off matches the lightweight nature of a marketing site.

## Scope

Base architecture and bootstrap code for the `apps/landing` React SPA:
- Folder structure separating layout components, marketing sections, UI primitives, pages, API stubs, and helpers (`components/layout/`, `components/sections/`, `components/ui/`, `pages/`, `api/`, `lib/`).
- Reusable structural components in `components/layout/` (`Navbar`, `Footer`).
- Example marketing sections in `components/sections/` (`Hero`, `Features`, `CTA`).
- Local UI primitives in `components/ui/` (`Button`, `Badge`) with no external dependencies beyond React.
- A main `HomePage.tsx` page composing the example sections.
- A stub `api/contact.ts` function placeholder for future contact form submission.
- Generic, React-free helpers in `lib/utils.ts`.
- Minimal routing exposing a single `/` route rendering `HomePage`.

## Out of scope

- React Query (no complex data fetching).
- Zustand (no global state).
- Domain types from `@repo/types` (the landing does not consume business entities).
- A complete design system (tokens, typography, colour palette).
- A functional contact form (only a stub).
- Additional pages (blog, pricing, etc.).

## Functional requirements

| ID   | Requirement |
|------|-------------|
| R001 | The system shall organise the `apps/landing/src` codebase into the following folders: `components/layout/`, `components/sections/`, `components/ui/`, `pages/`, `api/`, `lib/`. |
| R002 | The system shall provide reusable structural components `Navbar` and `Footer` under `components/layout/`. |
| R003 | The system shall provide example marketing sections `Hero`, `Features`, and `CTA` under `components/sections/`. |
| R004 | The system shall provide local UI primitives `Button` and `Badge` under `components/ui/`. |
| R005 | The system shall provide a `pages/HomePage.tsx` page that composes the marketing sections together with the layout components. |
| R006 | The system shall provide an `api/contact.ts` module exporting a stub function for future contact form submissions. |
| R007 | The system shall provide a `lib/utils.ts` module exporting generic helpers free of React dependencies. |
| R008 | The system shall configure React Router with a minimum routing setup exposing a single `/` route that renders `HomePage`. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NF001 | The system shall ensure that marketing sections under `components/sections/` are independent from each other and composable in any order within `HomePage`. |
| NF002 | The system shall ensure that components under `components/ui/` have no external dependencies beyond React. |

## Edge cases

| ID    | Case |
|-------|------|
| EC001 | WHEN the `api/contact.ts` stub function is invoked, the system shall return a resolved placeholder response without performing a real network call, so the base structure remains usable before a backend endpoint exists. |
| EC002 | WHEN a route other than `/` is requested, the system shall not crash; routing must degrade gracefully given the minimal routing surface. |

## Technical constraints

- Framework: Vite + React + TypeScript.
- No React Query and no Zustand.
- HTTP: native `fetch` only where strictly necessary.
- Routing: React Router (minimal setup).

## Dependencies

- INFRA-001 — the `landing` app must already exist in the monorepo.

## Effort estimate

**medium** — 8 functional requirements covering the folder structure, layout components, three example sections, two UI primitives, the home page, a contact API stub, helpers, and routing; 2 non-functional requirements that constrain section composability and UI primitive purity; 2 edge cases tied to the contact stub and unknown routes; one upstream dependency (INFRA-001).
