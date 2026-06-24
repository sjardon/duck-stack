# SERVICES-004 — Normalize file naming to lowercase camelCase

## Reason for being

`duck-spec/docs/BACKEND.md` defines the file naming convention as camelCase starting with lowercase, without dot-separated suffixes nor `kebab-case`. Today there are files under `apps/services/src/` that violate this convention: plugins (`error-handler.ts`, `require-auth.ts`, `require-org.ts`, `clerk-auth.plugin.ts`), entities of every module (`user.entity.ts`, `subscriptionPlan.entity.ts`, `transaction.entity.ts`, `refund.entity.ts`) and DTOs (`checkout.dto.ts`, `updateProfile.dto.ts`, `completeOnboarding.dto.ts`). The inconsistency hinders file discovery, makes naming criteria negotiable per file, and blocks future automated convention audits.

The goal is that every file under `apps/services/src/` complies with the lowercase camelCase naming rule, without dot-separated suffixes nor `kebab-case`.

## Scope

This analysis covers renaming the offending plugin, entity, and DTO files under `apps/services/src/` to lowercase camelCase, updating every import (source and test) to point to the new file names, and preserving the observable behavior of the application. The change is purely a structural renaming exercise: no class, function, interface, or type names are altered, and no files outside `apps/services/src/` are restructured.

## Out of scope

- Renaming classes, functions, interfaces, or types
- Behavior changes or changes to the contents of the renamed files
- Renaming type declaration files (`*.d.ts`)
- Renaming folders
- Reorganizing the structure of modules

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall name every file under `apps/services/src/shared/plugins/` in lowercase camelCase, without hyphens and without a `.plugin.ts` suffix. |
| R002 | Ubiquitous | The system shall name every entity file under each module of `apps/services/src/modules/<module>/entities/` in lowercase camelCase, without a `.entity.ts` suffix. |
| R003 | Ubiquitous | The system shall name every DTO file under each module of `apps/services/src/modules/<module>/dtos/` in lowercase camelCase, without a `.dto.ts` suffix. |
| R004 | Ubiquitous | The system shall update every `import` statement and module reference in source code and tests to point to the renamed files. |
| R005 | Ubiquitous | The system shall preserve the observable behavior of the application (routes, responses, logs) identical to the behavior prior to the renames. |
| R006 | Conditional | IF a test file existed before the renames, THEN the system shall keep its test logic unchanged, modifying only its `import` paths. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | No file inside `apps/services/src/` shall contain hyphens nor dot-separated suffixes other than `.ts`, `.d.ts`, and `.test.ts`. |
| NF002 | Git history shall be able to follow the rename of each file (one commit per rename or renames detectable by similarity). |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a file outside `apps/services/` (e.g. integration tests or scripts) imports a renamed file, the system shall update those imports so the modules continue to resolve to the new file names. |
| EC002 | WHEN a relative import that depends on the old name appears in a re-export chain (e.g. an `index.ts` barrel), the system shall update those re-exports to point to the new file name. |
| EC003 | WHEN module resolution is performed on a case-insensitive filesystem (e.g. macOS default APFS), the system shall continue to resolve every renamed module without producing missing-module or duplicate-module errors at build, dev, and test time. |
| EC004 | WHEN the build (`pnpm build`), lint (`pnpm lint`), and test suite are executed after the renames, the system shall complete each command with exit code 0. |

## Technical constraints

- Renames are confined to files under `apps/services/src/`.
- Class, function, interface, and type names defined inside the renamed files must not be modified.
- The two documented `process.env` exceptions in BACKEND.md (`shared/infrastructure/db.ts` for `DATABASE_URL` and `clerkAuthPlugin` for `CLERK_SECRET_KEY`) keep their existing role; this feature only adjusts the filename of the latter to comply with the convention.
- Type declaration files (`*.d.ts`) and folder names are not renamed.
