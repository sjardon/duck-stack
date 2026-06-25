# SERVICES-009 — Use case, handler & webhook route compliance

## Reason for being

`duck-spec/docs/BACKEND.md` defines three rules for the orchestration layer of `apps/services` that are not currently satisfied: (1) handlers must not contain `try/catch` that duplicates `errorHandler` work, (2) webhook routes must not replicate the `errorHandler` contract by emitting manual `reply.status(...)` payloads, and (3) every `catch` must log, and every silent-fail must carry a justifying comment. Today `completeOnboardingHandler` and `updateUserProfileHandler` catch `ZodError` and respond manually with `reply.status(400).send(...)`; `webhooks/clerk/routes.ts` does manual `reply.status(400)` for missing Svix headers and signature verification failures; and `checkoutUseCase`, `cancelSubscriptionUseCase`, `listTransactionsUseCase`, `clerkAuthPlugin`, `webhooks/mobbex/routes.ts`, and `mobbexProvider.handleErrorResponse` capture errors without logging and/or silently fail without a justifying comment. The consequences are inconsistent HTTP error contracts (`{ error: ... }` vs `{ code, message }`), incomplete traces (catches without logs), and unauditable silent fails.

Move use cases, handlers, webhook routes and plugins to the state where every error decision flows through one of the three valid outcomes (log + re-throw, log + transform, log + handle with justifying comment), and where the HTTP error contract is always emitted by `errorHandler`.

## Scope

The requirements cover the orchestration layer of `apps/services` only: Fastify handler functions, webhook routes, use cases that already contain `catch` blocks, and the `clerkAuthPlugin`. The change normalizes error handling so that handlers never replicate `errorHandler`, webhook routes always emit `DomainError`s instead of manual replies, every `catch` logs at the correct level, and every retained silent-fail is documented inline. Observable HTTP behavior (status codes and error `code`s) is preserved at every endpoint and webhook.

## Out of scope

- Changes to the domain error model (those belong to SERVICES-007).
- Changes to repositories or provider adapters (those belong to SERVICES-008).
- Changes to Zod DTOs or to the validation rules they encode.
- Replacing `throw new Error(...)` in bootstrap code (DB, plugins, providers).
- Rewriting the webhook dispatch logic.
- Adding new use cases, handlers, or webhook providers.
- Changing the format, transport, or fields of the structured logger beyond what the layer rules require.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN `completeOnboardingHandler` receives a request whose body fails Zod validation the system shall throw a `ValidationError` so the response is serialized by `errorHandler` instead of by a handler-local `reply.status(400)`. |
| R002 | Event-driven | WHEN `updateUserProfileHandler` receives a request whose body fails Zod validation the system shall throw a `ValidationError` so the response is serialized by `errorHandler` instead of by a handler-local `reply.status(400)`. |
| R003 | Ubiquitous | The system shall remove every handler-local `try/catch` in `completeOnboardingHandler` and `updateUserProfileHandler` whose only purpose is to translate a thrown error into an HTTP response. |
| R004 | Event-driven | WHEN the Clerk webhook handler receives a request with a missing Svix header the system shall throw the corresponding `DomainError` (`ValidationError`) so the response is serialized by `errorHandler` instead of by a handler-local `reply.status(400)`. |
| R005 | Event-driven | WHEN the Clerk webhook handler receives a request whose Svix signature verification fails the system shall throw the corresponding `DomainError` (`ValidationError` or `UnauthorizedError`) so the response is serialized by `errorHandler` instead of by a handler-local `reply.status(400)`. |
| R006 | Event-driven | WHEN the Mobbex webhook handler fails to `JSON.parse` the raw request body the system shall log the parse failure detail before throwing a `ValidationError`. |
| R007 | Ubiquitous | The system shall log every `catch` block in `checkoutUseCase`, `cancelSubscriptionUseCase`, and `listTransactionsUseCase` before re-throwing, transforming, or handling the error. |
| R008 | Conditional | IF a `catch` in a use case observes a `DomainError` with a 4xx `statusCode`, THEN the system shall log the error at `warn` level. |
| R009 | Conditional | IF a `catch` in a use case observes a `DomainError` with a `statusCode` ≥500 or a non-`DomainError`, THEN the system shall log the error at `error` level including its stack trace. |
| R010 | Conditional | IF `cancelSubscriptionUseCase` catches a `ProviderError` with `statusCode` 400 while cancelling at the provider, THEN the system shall log the failure and return the locally-cancelled subscription as today, with a code comment justifying why this silent-fail is non-critical. |
| R011 | Conditional | IF `clerkAuthPlugin` catches a JWT verification failure, THEN the system shall log the failure at `warn` level and leave `request.userId` and `request.orgId` undefined, with a code comment justifying the silent-fail behaviour. |
| R012 | Conditional | IF `mobbexProvider.handleErrorResponse` catches a `JSON.parse` failure when reading the provider error body, THEN the system shall log the discarded body parse failure and continue, with a code comment justifying the silent-fail behaviour. |
| R013 | Ubiquitous | The system shall ensure that every silent-fail (`return`, `return null`, or sentinel without re-throw) preserved by this feature carries an inline code comment explaining why the failure is non-critical and why the caller can continue. |
| R014 | Ubiquitous | The system shall preserve the observable HTTP behaviour of every affected endpoint and webhook: identical status codes and identical error `code` values, now always emitted by `errorHandler`. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Every `catch` touched by this feature shall end in exactly one of the three valid outcomes documented in BACKEND.md: log + re-throw, log + transform, or log + handle. |
| NF002 | The structured log emitted by each `catch` shall include `requestId` whenever the catch runs inside an HTTP request scope, consistent with the AsyncLocalStorage-backed mixin established in SERVICES-005. |
| NF003 | The HTTP response body for every 4xx and 5xx error originating in the touched sites shall match the contract `{ code, message }` for `DomainError` instances and `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` for non-`DomainError` instances. |
| NF004 | Logs emitted by the touched `catch` blocks shall not include secrets, tokens, or PII. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the Clerk webhook handler receives a request with a missing Svix header the system shall respond with HTTP 400 and body `{ code: 'VALIDATION_ERROR', message: <error message> }` via `errorHandler`, replacing the previous manual `{ error: ... }` 400 response. |
| EC002 | WHEN the Clerk webhook handler receives a request whose Svix signature verification fails the system shall respond with the current status code (400) and body `{ code: 'VALIDATION_ERROR', message: <error message> }` via `errorHandler`; if migrating the status to 401 (`UnauthorizedError`) is desired, that decision shall be documented in design.md and not assumed at analysis time. |
| EC003 | WHEN `cancelSubscriptionUseCase` receives a `ProviderError` with `statusCode` 400 while cancelling the subscription at the provider the system shall log the failure at `warn` level, return the locally-cancelled subscription DTO, and the response shall match today's observable behaviour. |
| EC004 | WHEN `clerkAuthPlugin` catches a JWT verification failure for an invalid or expired token the system shall log at `warn` level and leave `request.userId` and `request.orgId` undefined so downstream `requireAuth` / `requireOrg` preHandlers decide whether the route is anonymous-friendly. |
| EC005 | WHEN a use case `catch` re-throws the same error without semantic enrichment the system shall log and re-throw as-is, without wrapping in another `DomainError`, unless wrapping improves the caller's semantics. |
| EC006 | WHEN the Mobbex webhook handler fails to `JSON.parse` the body the system shall log the parse failure (including a short, non-sensitive excerpt of the failure detail) before throwing `ValidationError`, so the response is `{ code: 'VALIDATION_ERROR', message: <error message> }` at status 400 via `errorHandler`. |
| EC007 | WHEN `mobbexProvider.handleErrorResponse` cannot parse the provider's error body as JSON the system shall log the discarded parse failure with a justifying comment and continue mapping to the corresponding `ProviderError` status (502 or 400) as it does today. |
| EC008 | WHEN a handler-thrown error reaches `errorHandler` the system shall log the error exactly once at `errorHandler`, even though intermediate use-case catches may have logged the same error earlier — duplicate logs are preferred to missing ones per BACKEND.md. |

## Technical constraints

- Depends on SERVICES-007: the updated `DomainError` signature `(code, message, statusCode, originalError?)` and the updated `errorHandler` contract must be in place before this feature can be implemented.
- The static Pino logger exported from `shared/infrastructure/logger.ts` is the only logger used by these `catch` blocks; do not introduce per-request child loggers or alternate logger instances (SERVICES-005 invariant).
- No new dependencies; only standard library, existing `DomainError` subclasses, and the existing logger may be used.
- Do not change Zod schemas, repository interfaces, or use case constructor signatures.
