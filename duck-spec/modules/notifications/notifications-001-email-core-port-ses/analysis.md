# NOTIFICATIONS-001 — Email Core: Port, SES Adapter, Async Delivery

## Reason for being

The `auth` module (implemented) plus `billing` and `subscriptions` (planned) will need to emit transactional emails — welcome, payment receipt, subscription activated, etc. Today there is no mechanism in the stack for sending emails, no convention for where templates live, and no delivery pipeline. Each future consumer would otherwise have to know the provider and manage its own queueing.

This feature builds the `notifications` module: a typed email-sending port, in-code templates, and an asynchronous delivery pipeline. Once it lands, any consumer can define templates and request sends without coupling to the provider or the queue mechanics.

## Scope

The requirements cover a typed email-sending port with compile-time template variable validation, an initial adapter over AWS SES, asynchronous delivery via SQS with an independent worker, retry semantics with a dead-letter queue, structured logging with correlatable identifiers, rejection of unknown templates before enqueue, and a non-business example template that exercises the full end-to-end flow.

## Out of scope

- Concrete business templates (welcome, password reset, payment receipt, etc.) — deferred to the consuming module features.
- Real wiring with `auth`, `billing`, or `subscriptions`.
- Persistence of send history and final delivery outcomes (NOTIFICATIONS-002).
- Provider event webhooks — delivery, bounce, complaint (NOTIFICATIONS-002).
- Suppression list and automatic suppression on bounces / complaints (NOTIFICATIONS-003).
- Non-email channels: in-app, SMS, push, outbound webhooks.
- Additional provider adapters beyond the initial one (Resend, SendGrid, etc.) — the module is designed to accept them but only one ships here.
- Per-language templates / i18n.
- Multi-tenant template overrides.
- Scheduled or delayed sends and attachments.
- UI for template management.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall expose a typed email-sending port that accepts a template identifier and the template's required variables. |
| R002 | Ubiquitous | The system shall validate at compile time that the variables supplied for a template are complete and of the correct types for that template. |
| R003 | Event-driven | WHEN a consumer requests an email send through the port, the system shall enqueue the send and return control to the caller without waiting for provider delivery. |
| R004 | Event-driven | WHEN a queued send message is picked up by the worker, the system shall render the referenced template with the supplied variables and dispatch the resulting email to the email provider. |
| R005 | Conditional | IF a provider dispatch fails with a transient error, THEN the system shall retry the send according to the configured retry policy. |
| R006 | Conditional | IF a queued send message exhausts its retry budget, THEN the system shall move it to a dead-letter queue for later inspection instead of dropping it. |
| R007 | Event-driven | WHEN a send is requested with a template identifier that is not registered, the system shall reject the request before enqueueing and surface a validation error to the caller. |
| R008 | Event-driven | WHEN any send operation is processed (request, enqueue, dispatch, retry, dead-letter), the system shall emit a structured log entry containing `requestId`, `userId` when available, `templateId`, `outcome`, and `duration`. |
| R009 | Ubiquitous | The system shall ship at least one non-business example template that exercises the port, the queue, the worker, and the SES adapter end to end. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Log entries emitted by the send pipeline shall not contain the rendered email body nor the full content of template variables; only identifiers are permitted. |
| NF002 | A transient provider outage shall not cause message loss: unacknowledged messages remain in the queue until the worker can process them, and messages that exhaust retries land in the dead-letter queue. |
| NF003 | The queue-processing worker shall be deployable and horizontally scalable independently of the API service. |
| NF004 | Provider credentials and infrastructure ARNs shall be sourced from environment variables and shall never be committed to the repository. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the worker receives a queue message whose payload fails deserialization, the system shall log the parse error with the message identifier and discard the message without retrying, so a poison message cannot block the queue. |
| EC002 | WHEN the provider responds with a transient error (5xx, timeout, throttling), the system shall leave the message unacknowledged so it returns to the queue and is retried per the configured policy. |
| EC003 | WHEN the provider responds with a permanent error (invalid address, invalid payload), the system shall stop retrying that message and route it to the dead-letter queue. |
| EC004 | WHEN the worker crashes or is interrupted after a successful provider dispatch but before acknowledging the queue message, the system shall allow the message to be reprocessed on the next visibility cycle; a duplicate delivery is accepted in this feature (robust deduplication is deferred to NOTIFICATIONS-002). |

## Technical constraints

- Architecture pattern: Port & Adapter — a `IEmailNotifier` port with an initial adapter implemented over AWS SES.
- Templates are defined in code (not in the provider's console) and implemented with React Email.
- Asynchronous delivery uses AWS SQS with a dedicated worker; the consumer's use case publishes to the queue and never calls the provider synchronously.
- Retry policy and dead-letter routing are configured at the SQS level rather than in application code.
- Error handling follows the conventions in `duck-spec/docs/BACKEND.md` — provider failures raised inside the worker use `ProviderError` (502 for transient, 400 for validation-style provider errors); unknown-template rejection at the port uses `ValidationError`.
- Logging uses the static Pino logger from `shared/infrastructure/logger.ts`; log entries follow the structured-logging rules (stable field names, no secrets, no PII, no rendered content).
- Depends on SERVICES-001 — the base structure of `apps/services` must exist.
