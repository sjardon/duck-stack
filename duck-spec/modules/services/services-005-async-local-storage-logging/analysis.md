# SERVICES-005 — Propagate request-bound logging context via AsyncLocalStorage

## Reason for being

`duck-spec/docs/BACKEND.md` requires that every log line emitted during the lifecycle of an HTTP request includes a `requestId` so traces can be correlated. Today, repositories (`TransactionDBRepository`, `MobbexBillingSyncRepository`, `ClerkSyncRepository`, `UserDBRepository`, `SubscriptionPlanDBRepository`), the use cases of the `billing` module, and the webhook dispatchers import the static Pino logger from `src/shared/infrastructure/logger.ts` and emit logs through it. Because that logger does not know the request context, lines emitted during a request (query latency, business warnings, transaction and refund outcomes) do not include `requestId` and end up disconnected from the originating request's trace. Only `modules/webhooks/mobbex/routes.ts` currently complies, logging directly through `request.log`.

The feature ensures that every log line emitted during the lifecycle of a request includes the `requestId`, without modifying use case, repository, or dispatcher signatures, and without altering the behavior of logs emitted outside a request scope.

## Scope

The requirements cover the introduction of a Node.js `AsyncLocalStorage`-backed request context, a Fastify `onRequest` hook that populates the store with `{ requestId: request.id }`, and a Pino `mixin` on the static logger that merges `requestId` into every log line when the store is populated. They also cover preservation of existing log content, level, and structured fields, as well as correct isolation between concurrent requests.

## Out of scope

- Modifying method signatures of use cases, repositories, or dispatchers to receive a logger by parameter
- Changes to the text, level, or structured-field schema of existing logs
- Adding new logs in locations that do not log today
- Introducing a distributed tracing system (OpenTelemetry, etc.)
- Changes to the log transport (`pino-pretty` vs JSON)
- Propagating context fields other than `requestId` (e.g. `tenantId`, `userId`)

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a log line is emitted during the processing of an HTTP request, the system shall include a `requestId` field in that log line. |
| R002 | Ubiquitous | The system shall set the `requestId` included in request-scoped log lines to the value of `request.id` assigned by Fastify. |
| R003 | Conditional | IF a log line is emitted outside the scope of an HTTP request (server bootstrap, initial DB wiring, payment provider factory), THEN the system shall omit the `requestId` field from that log line. |
| R004 | Ubiquitous | The system shall keep repositories, use cases, and webhook dispatchers emitting logs through the static Pino logger exported from `shared/infrastructure/logger.ts`, without altering any method or function signature. |
| R005 | Event-driven | WHEN two or more HTTP requests are processed concurrently, the system shall tag each emitted log line with the `requestId` of the request that originated it, with no cross-contamination between requests. |
| R006 | Ubiquitous | The system shall preserve the text, level, and structured fields of every existing log line identically to the pre-change behavior, adding only the `requestId` field when applicable. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The static Pino logger shall remain the only shared logger instance; no per-request child logger or additional logger instance is introduced. |
| NF002 | No new external runtime dependency shall be introduced; the implementation shall rely exclusively on `node:async_hooks` (Node.js built-in) and the Pino `mixin` API already available in the installed Pino version. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN two HTTP requests are in-flight simultaneously, the system shall keep their `AsyncLocalStorage` stores isolated so that each log line carries only the `requestId` of its originating request and never the other request's `requestId`. |
| EC002 | WHEN request-handling code crosses async boundaries (`await`, `setImmediate`, `setTimeout`, DB driver callbacks), the system shall preserve the original request's `requestId` across the entire async chain so log lines emitted after the boundary still include the correct `requestId`. |
| EC003 | WHEN an error is raised before the route handler runs (body parsing failure, schema validation failure, webhook signature verification failure) and is caught by the global error handler, the system shall include the originating request's `requestId` in the error log line. |
| EC004 | WHEN code shared between request and non-request callers (utilities reused in bootstrap and in handlers) emits a log line, the system shall include `requestId` if invoked inside a request scope and omit it if invoked outside, using a single implementation path (the mixin reading the store). |

## Technical constraints

- Request context is stored in a single instance of `AsyncLocalStorage` from `node:async_hooks`.
- The store is populated in a Fastify `onRequest` hook that wraps the remainder of the request lifecycle in `asyncLocalStorage.run(...)` with `{ requestId: request.id }`.
- The static Pino logger in `shared/infrastructure/logger.ts` is configured with a `mixin` that reads the store on each log line and merges `{ requestId }` into the output when present.
- When the store is empty (code running outside a request scope), the `mixin` returns `{}` so that `requestId` is omitted, preserving current behavior.
- Dependencies: SERVICES-001 — the static Pino logger and the Fastify base must already exist.
