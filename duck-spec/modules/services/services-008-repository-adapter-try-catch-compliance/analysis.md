# SERVICES-008 — Repository & adapter try/catch compliance

## Reason for being

`duck-spec/docs/BACKEND.md` mandates that every external call from repositories, adapters, and provider clients be wrapped in `try/catch`, log the original cause, and re-throw a `DomainError` (typically `ProviderError`) with the cause attached as `originalError`. Today none of the repositories under `apps/services/src/` comply with this rule: `userDBRepository`, `subscriptionDBRepository`, `subscriptionPlanDBRepository`, `transactionDBRepository`, `clerkSyncRepository`, and `mobbexBillingSyncRepository` execute SQL queries without wrapping them. Any Postgres failure (timeout, dropped connection, unexpected constraint violation, driver error) bubbles up as a non-domain error, gets logged — at best — only at the `errorHandler`, and loses the repository, method, and parameter context that triggered it. The `mobbexProvider` adapter likewise fails to log the original cause before wrapping it in `ProviderError`. This breaks the traceability documented in BACKEND.md.

Bring every repository and provider adapter to the state where each external call satisfies the "log + wrap + re-throw" rule with the cause attached as `originalError`.

## Scope

The requirements cover the introduction of `try/catch` blocks around every external call site in the six repositories (`userDBRepository`, `subscriptionDBRepository`, `subscriptionPlanDBRepository`, `transactionDBRepository`, `clerkSyncRepository`, `mobbexBillingSyncRepository`) and the `mobbexProvider` adapter, ensuring each catch logs the original cause (with repository name, method, and non-sensitive parameters) and re-throws a `DomainError` carrying the cause in `originalError`. The scope also includes the transactional steps inside `mobbexBillingSyncRepository.sql.begin` blocks and the silent-fail justification for `mobbexProvider.handleErrorResponse`'s JSON-parse catch.

## Out of scope

- Cambios en use cases, handlers o webhook routes (corresponden a SERVICES-009)
- Cambios en las queries SQL (selects, joins, where, returning, etc.) o en el resultado observable de cada método del repository
- Nuevas métricas u observabilidad más allá del log requerido por BACKEND.md
- Reemplazo de `throw new Error(...)` en código de bootstrap

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall execute every SQL query in `userDBRepository`, `subscriptionDBRepository`, `subscriptionPlanDBRepository`, `transactionDBRepository`, `clerkSyncRepository`, and `mobbexBillingSyncRepository` inside a `try/catch` block, regardless of whether the query is standalone or part of a `sql.begin` transactional block. |
| R002 | Event-driven | WHEN a SQL query executed by a repository fails, the system shall log the original cause at `error` level — including the repository name, method name, relevant non-sensitive parameters, and stack trace — and re-throw the failure as a `DomainError` instance with the original cause attached as `originalError`. |
| R003 | Conditional | IF a repository method already translates a "row not found" outcome into a `NotFoundError` by domain rule, THEN the system shall preserve that behavior unchanged. |
| R004 | Ubiquitous | The system shall wrap every sub-query inside `mobbexBillingSyncRepository`'s `sql.begin` transactions such that any sub-query failure is logged once with its original cause and re-thrown as a `DomainError` with `originalError` set, while still allowing the transaction to abort automatically. |
| R005 | Event-driven | WHEN `mobbexProvider` issues an external HTTP call that fails (network, timeout, non-2xx response), the system shall log the original cause at the level dictated by the failure category and re-throw a `ProviderError` whose `originalError` references that cause. |
| R006 | Conditional | IF `mobbexProvider` receives a 401 or 5xx response from the external provider, THEN the system shall continue to map the failure to `ProviderError` with `statusCode 502`; IF it receives a 4xx response, THEN the system shall continue to map the failure to `ProviderError` with `statusCode 400`, in both cases attaching the original cause as `originalError`. |
| R007 | Ubiquitous | The system shall guarantee that no repository or adapter lets an external-call failure (network, timeout, driver error, or provider error) escape without first being logged at the call site. |
| R008 | Conditional | IF `mobbexProvider.handleErrorResponse` cannot parse the error body as JSON, THEN the system shall log a warning describing that the body was discarded and document the silent-fail with a justifying comment in code, preserving the existing fallback path. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Errors with `statusCode ≥ 500` (including Postgres driver errors) are logged at `error` level and include the stack trace. |
| NF002 | Every structured log emitted by a repository or adapter catch includes the repository (or adapter) class name and method name (e.g. `UserDBRepository.findByClerkUserId`) so the call site can be reconstructed without relying on the stack. |
| NF003 | Sensitive data (secrets, tokens, PII) never appears in the structured log payload of an original-cause entry. |
| NF004 | The observable behavior for happy-path cases (returned results, pagination, idempotency) is identical to the pre-change behavior. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a SQL query fails inside a `sql.begin` block after intermediate duration logs have already been emitted, the system shall log the original cause once at the failing call site and allow `postgres.js` to abort the transaction automatically without re-logging the same cause at the outer catch. |
| EC002 | WHEN `mobbexBillingSyncRepository` fails while resolving the `provider_transaction_id` by `reference`, the system shall log the SQL failure with repository, method, and `reference` value (non-sensitive) before the transaction aborts and re-throw a `DomainError` carrying the cause in `originalError`. |
| EC003 | WHEN `mobbexProvider` receives a 401 or 5xx response from the external provider, the system shall throw `ProviderError` with `statusCode 502` and `originalError` populated; WHEN it receives a 4xx response, the system shall throw `ProviderError` with `statusCode 400` and `originalError` populated. |
| EC004 | WHEN `mobbexProvider.handleErrorResponse` catches a JSON parse failure while reading the provider error body, the system shall emit a `warn` log noting the discarded body and continue with the fallback error mapping; the silent-fail site shall carry a code comment justifying the behavior. |
| EC005 | WHEN a repository method that historically returned `null` (or a sentinel) for a "row not found" lookup is invoked and the row is absent, the system shall continue to return the same sentinel without entering the catch path or emitting an error log. |
| EC006 | WHEN two concurrent repository calls fail simultaneously, the system shall emit two independent error logs each carrying the `requestId` of its originating request (via the `AsyncLocalStorage` mixin established in SERVICES-005) without cross-contaminating contexts. |

## Technical constraints

- Uses the `(code, message, statusCode, originalError?)` signature of `DomainError` introduced in SERVICES-007.
- Relies on the static Pino logger from `src/shared/infrastructure/logger.ts` (the only shared logger instance) and the `AsyncLocalStorage`-backed `requestId` mixin established in SERVICES-005; no logger is passed by parameter.
- `mobbexProvider.handleErrorResponse`'s body-parse `catch {}` remains as a silent-fail but must carry a justifying comment and emit at least a `warn` log when the body is discarded.
- Changes must not alter the SQL text (selects, joins, where clauses, `returning` clauses) of any repository method.
