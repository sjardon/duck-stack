# INFRA-001 — Monorepo Scaffolding

## Reason for being

The repository is currently empty. A base monorepo structure is required to support the three layers of the SaaS starter pack: the application frontend (`web`), the landing pages (`landing`), and the backend services (`services`), together with shared packages for configuration and domain schemas.

The objective is to create the base monorepo structure using Turborepo, scaffolding the three apps and the shared packages for TypeScript configuration, ESLint configuration, and shared TypeScript domain types.

## Scope

This analysis covers the initial scaffolding of a pnpm + Turborepo monorepo, the creation of three applications (`web`, `landing`, `services`), three shared packages (`@repo/tsconfig`, `@repo/eslint-config`, `@repo/types`), and the configuration of the Turborepo task pipeline for `build`, `dev`, and `lint`.

## Out of scope

- Shared React UI components package (`@repo/ui`).
- Authentication and authorization.
- CI/CD configuration.
- Deployment configuration (Docker, cloud, etc.).
- Any business logic for the application.

## Functional requirements

| ID | Requirement |
|----|-------------|
| R001 | The system shall be initialized as a Turborepo monorepo using pnpm workspaces. |
| R002 | The system shall include an application named `web` built with Vite, React, and TypeScript. |
| R003 | The system shall include an application named `landing` built with Vite, React, and TypeScript. |
| R004 | The system shall include an application named `services` built with Fastify and TypeScript. |
| R005 | The system shall provide a shared package `@repo/tsconfig` containing the base TypeScript configuration consumable by every app and package. |
| R006 | The system shall provide a shared package `@repo/eslint-config` containing the shared ESLint rules consumable by every app and package. |
| R007 | The system shall provide a shared package `@repo/types` containing the TypeScript domain interfaces shared across apps, with no external dependencies. |
| R008 | The system shall configure a Turborepo pipeline that exposes the tasks `build`, `dev`, and `lint`. |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NF001 | Each application (`web`, `landing`, `services`) shall be runnable independently via `pnpm dev` from its own workspace. |
| NF002 | Executing `pnpm build` from the repository root shall compile every app in the correct dependency order via Turborepo. |
| NF003 | TypeScript strict mode shall be enabled in every app and package. |

## Edge cases

| ID | Edge case |
|----|-----------|
| EC001 | If a shared package (`@repo/tsconfig`, `@repo/eslint-config`, `@repo/types`) changes, dependent apps must pick up the change through the pnpm workspace link without requiring manual reinstallation. |
| EC002 | If `pnpm dev` is run from the root, Turborepo shall start the dev task of every app in parallel without one app's failure aborting the others. |
| EC003 | If an app imports `@repo/types`, the import must resolve without pulling in any runtime dependency, since `@repo/types` exposes only TypeScript interfaces. |

## Technical constraints

- Package manager: pnpm.
- Monorepo orchestration: Turborepo.
- Frontend stack (`web`, `landing`): Vite + React + TypeScript.
- Backend stack (`services`): Fastify + TypeScript.
- Shared domain types: pure TypeScript interfaces in `@repo/types` with no external dependencies.
