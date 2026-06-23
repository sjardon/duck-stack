# SERVICES-003 — Centralize `process.env` reads in config files

## Reason for being

`duck-spec/docs/BACKEND.md` establishes that no application code may read `process.env` directly: every environment variable must be consumed through a typed configuration object under `src/shared/configs/<scope>Config.ts`, except for two explicitly documented exceptions (`shared/infrastructure/db.ts` for `DATABASE_URL` and `clerkAuthPlugin` for `CLERK_SECRET_KEY`). Today multiple files violate this rule: `app.ts`, `server.ts`, `shared/plugins/cors.ts`, `shared/infrastructure/logger.ts`, `shared/plugins/clerk-auth.plugin.ts` (for `CLERK_JWT_KEY`), `modules/webhooks/clerk/routes.ts`, and `modules/billing/providers/resolveProvider.ts`. As a result, env-var coupling is scattered, defaults are not discoverable from a single location, and new configuration dependencies can be added without passing through the config layer.

This feature centralizes all `process.env` reads under `src/shared/configs/`, so that application code depends only on typed configuration objects and the env-var surface is auditable from a single place.

## Scope

The requirements cover refactoring every non-exempt `process.env` reference in `apps/services/src/` to consume a typed config object under `src/shared/configs/`. The change must preserve observable behavior exactly (defaults, fail-fast errors, runtime responses) and must leave the two documented exceptions (`DATABASE_URL` in `db.ts`, `CLERK_SECRET_KEY` in `clerkAuthPlugin`) untouched.

## Out of scope

- Renaming existing files or classes.
- Behavior changes, new environment variables, or new defaults.
- Moving the two documented exceptions (`DATABASE_URL` in `db.ts`, `CLERK_SECRET_KEY` in `clerkAuthPlugin`).
- Schema validation of environment variables (e.g. with Zod) beyond TypeScript typing.
- Documentation of environment variables outside of code.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall expose, under `src/shared/configs/`, one typed configuration file per logical scope that surfaces every environment variable consumed by that scope as a typed object. |
| R002 | Event-driven | WHEN the server bootstrap module resolves host, port, log level, or environment, the system shall read those values from the corresponding typed config object instead of from `process.env`. |
| R003 | Event-driven | WHEN the CORS plugin resolves the allowed origin, the system shall read it from the corresponding typed config object instead of from `process.env`. |
| R004 | Event-driven | WHEN the Clerk authentication plugin resolves the Clerk JWT public key (`CLERK_JWT_KEY`), the system shall read it from the corresponding typed config object instead of from `process.env`. |
| R005 | Event-driven | WHEN the Clerk webhook module resolves its signing secret, the system shall read it from the corresponding typed config object instead of from `process.env`. |
| R006 | Event-driven | WHEN the payment provider resolver and the Mobbex provider resolve their credentials and feature flags, the system shall read every one of those values from the corresponding typed config object instead of from `process.env`. |
| R007 | Event-driven | WHEN the standalone Pino logger in `shared/infrastructure/logger.ts` resolves log level or environment, the system shall read those values from the corresponding typed config object instead of from `process.env`. |
| R008 | Ubiquitous | The system shall preserve the observable behavior of the app — defaults, startup errors, and HTTP responses — identically to the pre-centralization state. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The application shall continue to fail fast with a clear error message when a required environment variable (secrets, provider credentials) is absent, at the same lifecycle point as before the refactor. |
| NF002 | No file outside `src/shared/configs/` and the two documented exceptions (`shared/infrastructure/db.ts` for `DATABASE_URL`, `clerkAuthPlugin` for `CLERK_SECRET_KEY`) shall contain a reference to `process.env`. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a required environment variable that previously had a default value is absent, the system shall expose the same default value via the typed config object (no change in resolved value). |
| EC002 | WHEN a required environment variable without a default is absent and the consumer requires it, the system shall throw the same fail-fast error at the same lifecycle point as before the refactor (assumption: error class, message, and trigger point are preserved verbatim). |
| EC003 | WHEN `MOBBEX_TEST_MODE` is set to the string `"true"` or `"1"`, the typed config object shall expose a value that the Mobbex provider interprets as test mode enabled, preserving the existing dual-string acceptance semantics. |

## Technical constraints

- Config files must live under `src/shared/configs/<scope>Config.ts` following the shape documented in `duck-spec/docs/BACKEND.md` (`const env = process.env || {}; export const <scope>Config = { ... };`).
- The two documented exceptions (`DATABASE_URL` in `shared/infrastructure/db.ts`, `CLERK_SECRET_KEY` in `clerkAuthPlugin`) must remain reading `process.env` directly and must not be migrated as part of this feature.
- Typing is provided by TypeScript only; no runtime schema validation (e.g. Zod) is introduced.
- Existing config scopes (`dbConfig.ts`, `mobbexConfig.ts`) under `src/shared/configs/` must be reused where they already cover the relevant scope; new files are created only when no existing scope fits.
