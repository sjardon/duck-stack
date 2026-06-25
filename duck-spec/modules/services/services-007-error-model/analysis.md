# SERVICES-007 — Error model foundation: originalError + errorHandler logging & contract

## Reason for being

`duck-spec/docs/BACKEND.md` documents two contracts for the error model that are not currently honored in `apps/services/`:

1. The `DomainError` signature must be `(code, message, statusCode, originalError?)` so adapters and use cases can attach an internal cause without it ever leaking to the client. The current implementation in `src/shared/errors.ts` does not accept `originalError`.
2. `errorHandler.ts` must be the final logging site for every error and must serialize non-`DomainError` instances as `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` with status 500. The current implementation (`src/shared/plugins/errorHandler.ts`) does not log anything and, for non-`DomainError`, calls `reply.send(error)`, handing the raw error back to Fastify and leaking the real message to the client.

Without this foundation, downstream layers (repositories, use cases, handlers) cannot meet BACKEND.md's error-handling rules because neither the `originalError` mechanism nor the single logging site exist. The goal is to bring the error model up to the documented state: `DomainError` accepts `originalError`, and `errorHandler` logs every error before responding with the corresponding `{ code, message }` contract.

## Scope

Update the foundational error primitives shared by every layer of `apps/services/`: extend the `DomainError` base class to accept an optional `originalError`, and rewrite the Fastify `errorHandler` plugin so it logs every intercepted error at the correct level (with stack when appropriate) and replies with the documented JSON contract. The change is confined to `src/shared/errors.ts` and `src/shared/plugins/errorHandler.ts`; consumers across repositories, use cases, handlers, and webhook routes are left untouched (they will be migrated in SERVICES-008 and SERVICES-009).

## Out of scope

- Changes in repositories, providers, use cases, handlers, webhook routes, or plugins (those adjustments belong to SERVICES-008 and SERVICES-009).
- Replacing `throw new Error(...)` occurrences in bootstrap code (DB, plugins, providers).
- New subclasses of `DomainError`.
- Changes to log format beyond the level and the minimum payload required by the rule.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall expose a `DomainError` base class whose constructor accepts `(code, message, statusCode, originalError?)`, where `originalError` is an optional `unknown` parameter. |
| R002 | Ubiquitous | The system shall allow every existing subclass of `DomainError` (`NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ProviderError`) to be constructed without supplying `originalError`, preserving the current call sites and observable behavior. |
| R003 | Ubiquitous | The system shall allow every existing subclass of `DomainError` to be constructed with an optional `originalError` that is stored on the instance for internal use only. |
| R004 | Event-driven | WHEN the Fastify `errorHandler` intercepts an error during a request, the system shall log the error at the single final logging site before sending any HTTP response. |
| R005 | Conditional | IF the intercepted error is a `DomainError` with `statusCode` < 500, THEN the system shall log it at level `warn` including its `code`, `message`, `statusCode`, and any attached `originalError`. |
| R006 | Conditional | IF the intercepted error is a `DomainError` with `statusCode` >= 500, THEN the system shall log it at level `error` including its `code`, `message`, `statusCode`, stack trace, and any attached `originalError`. |
| R007 | Conditional | IF the intercepted error is not a `DomainError`, THEN the system shall log it at level `error` including its message, stack trace, and the original error instance. |
| R008 | Conditional | IF the intercepted error is a `DomainError`, THEN the system shall reply with a JSON body `{ code, message }` taken from the instance and HTTP status equal to the instance's `statusCode`. |
| R009 | Conditional | IF the intercepted error is not a `DomainError`, THEN the system shall reply with the fixed JSON body `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` and HTTP status 500. |
| R010 | Ubiquitous | The system shall never include `originalError`, stack traces, or any internal cause in the HTTP response body. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Every error log line emitted by `errorHandler.ts` must include the standard structured fields of the static logger (`requestId` when running inside a request scope per SERVICES-005, `level`, `message`, and `stack` when applicable). |
| NF002 | The HTTP body and status returned for any `DomainError` that is already correctly thrown today must remain byte-identical to the current observable behavior, except for the elimination of internal fields previously leaked by `reply.send(error)`. |
| NF003 | No non-`DomainError` may exit the server's HTTP response pipeline without first being logged by `errorHandler.ts`. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN an error is thrown outside the lifecycle of a request (for example, during server bootstrap, DB wiring, or provider factory initialization), the system shall let the existing bootstrap failure path handle it without invoking the `errorHandler` contract — the contract applies only to errors caught within a Fastify request. |
| EC002 | WHEN a `DomainError` already carrying an `originalError` is intercepted by the `errorHandler`, the system shall include the `originalError` in the log payload and shall omit it from the HTTP response body. |
| EC003 | WHEN a subclass of `DomainError` is instantiated without passing `originalError`, the system shall behave exactly as it does today: the instance carries no internal cause and the response body contains only `{ code, message }` at the instance's `statusCode`. |
| EC004 | WHEN Fastify itself emits an error that is not a `DomainError` instance but exposes a `statusCode` property (for example, a 404 route or a payload-too-large 413), the system shall treat it as a non-domain error, log it at level `error`, and respond with `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` at status 500 — Fastify's own `statusCode` is not honored by this contract. Assumption: this matches the documented "any other error -> INTERNAL_ERROR/500" rule and is the conservative interpretation; route-not-found semantics may be revisited in a later feature. |
| EC005 | WHEN two concurrent requests each throw an error processed by `errorHandler`, the system shall log each error tagged with the `requestId` of the request that originated it (relying on SERVICES-005's AsyncLocalStorage propagation) and shall send each response back on the correct reply object. |

## Technical constraints

- Modifications are restricted to `src/shared/errors.ts` (extend `DomainError` constructor signature; subclasses keep their current constructor surface while forwarding `originalError` to the base) and `src/shared/plugins/errorHandler.ts` (add logging at the documented levels and rewrite the non-`DomainError` branch to send the fixed `INTERNAL_ERROR/500` body).
- Logging must go through the static Pino logger exported from `src/shared/infrastructure/logger.ts`, consistent with the logging strategy established by SERVICES-001 and SERVICES-005. No new logger instance is introduced.
- No external dependencies are added; the change uses only existing Pino APIs and TypeScript primitives.
