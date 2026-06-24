# SERVICES-005 — Propagate request-bound logger across module layers

## Reason for being

`duck-spec/docs/BACKEND.md` mandates that inside a request scope code must use the Fastify-bound logger so that `requestId` is included automatically in every log line, and that the static Pino logger from `src/shared/infrastructure/logger.ts` is only allowed outside the request scope. Today this rule is honoured only in `modules/webhooks/mobbex/routes.ts`. Repositories (`TransactionDBRepository`, `MobbexBillingSyncRepository`, `ClerkSyncRepository`, `UserDBRepository`, `SubscriptionPlanDBRepository`) and the use cases of the `billing` module import the static logger, so the log lines they emit during a request — including DB query latency, business warnings, and refund/transaction outcome traces — do not include `requestId` and cannot be correlated with the original request trace.

The goal is that every log line emitted during the lifecycle of a request includes the `requestId`, propagating the Fastify-bound logger from the handler down to the use cases and the repositories, while preserving the static Pino logger for code that runs outside the request scope (server bootstrap, initial DB wiring, payment provider factory).

## Scope

This analysis covers introducing a logger interface compatible with Pino, threading the request-bound logger from each Fastify handler through every use case it invokes and into the repository methods that emit log lines during a request, including the dispatchers used by the Clerk and Mobbex webhook routes. It also covers preserving the existing static logger usage for code paths that execute outside the request scope. No log message text, log levels, log transports, or structured-log field schemas are modified.

## Out of scope

- Changes to the format of log messages or to the schema of structured-log fields
- Changes to the log level (`info`, `warn`, etc.) of existing lines
- Adding new log entries in places that do not log today
- Introducing a distributed tracing system (OpenTelemetry, etc.)
- Changes to the log transport (`pino-pretty` vs JSON)
- Changes to handlers that do not currently emit logs through a repository or use case (no new handler logging)

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a Fastify handler invokes a use case during a request, the system shall pass the request-bound logger (`request.log`) to the use case at invocation time. |
| R002 | Event-driven | WHEN a use case that was invoked from a request calls a repository method that emits log lines, the system shall pass the logger it received from the handler to that repository method. |
| R003 | Event-driven | WHEN a repository method executes inside the scope of a request, the system shall emit its query-latency metrics and business warnings through the logger received from the caller. |
| R004 | Event-driven | WHEN the Clerk webhook route dispatches an event to `ClerkSyncRepository`, the system shall pass the request-bound logger to the repository method invoked by the dispatcher. |
| R005 | Event-driven | WHEN the Mobbex webhook route dispatches an event to `MobbexBillingSyncRepository`, the system shall pass the request-bound logger to the repository method invoked by the dispatcher. |
| R006 | Ubiquitous | The system shall include the `requestId` field in every log line emitted during the processing of an HTTP request. |
| R007 | Ubiquitous | The system shall continue to use the static Pino logger from `src/shared/infrastructure/logger.ts` for log lines emitted outside the request scope (server bootstrap, initial database wiring, payment-provider factory). |
| R008 | Ubiquitous | The system shall preserve the existing log levels, message texts, and structured-log field names of every log line that exists today. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The interface of the injected logger shall be compatible with the Pino interface already used (`info`, `warn`, `error`, etc.) so that existing call sites do not need to be rewritten beyond replacing the imported binding with the injected parameter. |
| NF002 | The build (`pnpm build`), lint (`pnpm lint`), and test suite of `apps/services` shall complete with exit code 0 after the change. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a repository or utility is invoked both from a request scope and from outside the request scope (e.g. a method reused in startup and in a handler), the system shall accept the logger as a parameter so both call sites can supply either the request-bound logger or the static Pino logger without duplicating the implementation. |
| EC002 | WHEN an error occurs before the handler has the chance to forward the logger to a use case (e.g. body-parsing failure, signature verification failure, schema validation error), the system shall continue to surface the error through Fastify's global error handler using the request-bound logger so the error log line still includes `requestId`. |
| EC003 | WHEN a unit test exercises a use case or a repository method, the system shall accept a fake logger that satisfies the Pino-compatible interface so the test can run without instantiating a Fastify server. |
| EC004 | WHEN a repository method is invoked outside the request scope (e.g. a script or a startup task that reuses a repository), the system shall accept the static Pino logger as the logger argument and produce the same log output it produced before the change minus the `requestId` field. |

## Technical constraints

- The logger parameter type used in use cases and repositories must be the base Pino logger interface (e.g. `pino.BaseLogger` or `pino.Logger`) to avoid coupling those layers to Fastify-specific types.
- The static logger at `src/shared/infrastructure/logger.ts` remains the single source of truth for non-request code paths and is not removed.
- Handler files keep instantiating repositories and use cases inline (per BACKEND.md "one handler per feature" rule); the logger is supplied at method-call time, not stored on the repository or use case as state.
- Dispatcher signatures (`dispatchClerkEvent`, `dispatchMobbexEvent`) accept the logger as an explicit parameter rather than relying on closure capture, so they remain testable without a Fastify request.
- No log-line content or level is altered; only the logger instance through which the line is emitted changes.
