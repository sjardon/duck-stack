# SERVICES-011 — Error tracking del backend

## Reason for being

The backend already records its errors in the structured Pino log: `errorHandler.ts` is the final log site for every error, the original stack is preserved, and `requestId` is injected into every line through `AsyncLocalStorage`. INFRA-011 made those logs queryable in Better Stack. But nobody reads logs proactively — being able to search is not the same as being told.

There is also a deliberate blind spot. Email delivery is fire-and-forget by design (NOTIFICATIONS-001/002): `ResendEmailNotifier.send()` calls `dispatch()` without awaiting it and attaches a `.catch()` that logs and stops, so no failure can reach the calling module. That protects the request, but it means an email that never leaves produces no signal beyond a log line nobody is looking at.

**Goal:** every backend exception ends up reported, grouped, and correlated with the request that originated it — including the ones that are currently caught and silently stopped.

## Scope

The requirements cover reporting unhandled exceptions that reach the Fastify error handler, reporting exceptions raised outside the request lifecycle (notably inside the fire-and-forget email wrapper), enriching each report with the request identifier, environment, and deployed service version, grouping repeated occurrences of the same condition, scrubbing secrets/tokens/PII before transmission, and making the whole instrumentation opt-in through typed configuration so its absence never blocks startup or operation.

## Out of scope

- Instrumentation of the SPAs (`apps/web` → WEB-002, `apps/landing` → LANDING-002)
- Distributed tracing and performance metrics
- Alerting on business conditions
- Changes to the domain error model (`shared/errors.ts`) or to the `errorHandler` response contract
- Retries or automatic recovery after an error
- Replacing or altering the existing structured logging strategy

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN an unhandled exception reaches the server's error handler, the system shall report it to the error tracking provider including its full stack trace. |
| R002 | Event-driven | WHEN an exception is raised outside the request lifecycle — including one caught and stopped by the fire-and-forget email delivery wrapper — the system shall report it to the error tracking provider. |
| R003 | Event-driven | WHEN a report is sent and a request identifier is available in the asynchronous context, the system shall attach that same request identifier to the report. |
| R004 | Ubiquitous | The system shall include the environment name and the deployed service version in every report sent to the provider. |
| R005 | Ubiquitous | The system shall group reports produced by the same error condition into a single issue instead of emitting independent incidents. |
| R006 | Ubiquitous | The system shall exclude secrets, tokens, and personal data from every payload transmitted to the error tracking provider. |
| R007 | Conditional | IF the error tracking configuration is present, THEN the system shall initialize the reporting client at startup and report according to R001–R006. |
| R008 | Conditional | IF the error tracking configuration is absent, THEN the system shall start and serve requests normally with reporting disabled and without raising a startup error. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Report transmission shall not block the HTTP response: the reply is sent to the client without waiting for the provider round-trip, adding no perceptible latency to the request. |
| NF002 | A failure, timeout, or unavailability of the error tracking provider shall not degrade, interrupt, or change the outcome of any request or background operation. |
| NF003 | Payloads sent to the provider shall comply with the same no-PII/no-secrets policy already in force for structured logs (no passwords, tokens, credentials, or personal data). |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the fire-and-forget email wrapper catches a delivery failure and stops it, the system shall explicitly report that caught error to the provider — instrumentation that only listens to uncaught exceptions would leave this case as invisible as it is today. |
| EC002 | WHEN an exception is reported for a request that carried a body, the system shall transmit the report with request body data removed from the payload; this scrubbing shall be active in the first deployment of the feature rather than added afterwards. |
| EC003 | WHEN the error handler processes an expected domain error (`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError` and other `DomainError` instances with a 4xx status), the system shall not send a report to the provider, so real failures are not drowned in noise. |
| EC004 | WHEN the same error condition is raised repeatedly at high frequency (inside a loop or on a hot endpoint), the system shall cap what it transmits via a configured sampling/rate-limit setting so that provider quota is not exhausted. *(Assumption: FEATURES.md only states the risk; the conservative behavior adopted is a configurable client-side sample rate whose default keeps volume bounded, never dropping the first occurrence of a condition.)* |
| EC005 | WHEN an exception is raised outside the `AsyncLocalStorage` request context and therefore carries no request identifier, the system shall still send the report, omitting the request identifier field rather than discarding the report. |
| EC006 | WHEN the service starts without the error tracking configuration variable set, the system shall complete startup, respond normally on `/health`, and skip reporting client initialization without logging an error-level entry. |

## Technical constraints

- Error tracking provider: **Better Stack**, compatible with the Sentry SDKs.
- Instrumentation uses the **Sentry SDK for Node**, pointed at the provider destination through configuration, so that switching providers is a change of one variable.
- Typed configuration under `src/shared/configs/` (e.g. `errorTrackingConfig.ts`), with no direct `process.env` reads outside configuration files — per the backend configuration rule.
- The instrumentation must not require modifying existing use cases, repositories, or adapters; it attaches at cross-cutting points (server bootstrap, `errorHandler.ts`, the fire-and-forget wrapper).
- Depends on INFRA-011: the observability provider account and its per-environment conventions must already exist.
