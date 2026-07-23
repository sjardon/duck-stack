# NOTIFICATIONS-001 — Email Core: Port, SES Adapter, Async Delivery

## Reason for being

The stack currently has no mechanism to emit transactional emails. `auth` is implemented and `billing`/`subscriptions` are planned — all of them will need to send transactional emails (welcome, payment receipt, subscription activated, etc.). There is no convention for where templates live nor how emails are delivered, and no consumer should have to know the concrete provider or the queue mechanics.

This feature builds the base `notifications` module: a typed email-send interface, templates defined in code, and asynchronous delivery via a queue. It leaves the module ready for any consumer to define its own templates and trigger sends without coupling to the provider.

## Scope

The requirements cover a typed, provider-agnostic send interface whose template variables are validated at compile time, immediate (fire-and-forget) enqueuing of send requests, asynchronous delivery in a separate worker, automatic transient retries with a dead-letter queue for exhausted messages, unknown-template rejection before enqueuing, correlatable structured logging per send, and at least one non-business example template exercising the end-to-end flow.

## Out of scope

- Concrete business templates (welcome, password reset, payment receipt, etc.) — delivered as tasks inside the consuming modules' features.
- Real wiring with `auth`, `billing`, or `subscriptions`.
- Persistence of send history and final delivery states (NOTIFICATIONS-002).
- Provider event webhooks (delivery / bounce / complaint) (NOTIFICATIONS-002).
- Suppression list and automatic suppression on bounces/complaints (NOTIFICATIONS-003).
- Channels other than email (in-app, SMS, push, outbound webhooks).
- Adapters other than the initial one (Resend, SendGrid, etc.) — the module allows adding them, but this feature ships only one.
- Per-language templates / i18n.
- Multi-tenant template overrides.
- Scheduled / delayed sends and attachments.
- UI for template management.
- Robust send deduplication (arrives with NOTIFICATIONS-002).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall expose a typed send interface that accepts a template identifier and the set of variables required by that template. |
| R002 | Ubiquitous | The system shall enforce at compile time that the variables provided for a send match, in name and type, exactly the variables required by the selected template. |
| R003 | Event-driven | WHEN a consumer requests a send, the system shall enqueue the request and return immediately without waiting for actual delivery. |
| R004 | Ubiquitous | The system shall perform actual email delivery asynchronously in a component separate from the request that issued the send. |
| R005 | Conditional | IF delivery to the provider fails with a transient error, THEN the system shall automatically retry the send according to the configured retry policy. |
| R006 | Conditional | IF the configured retries for a send are exhausted, THEN the system shall route the message to a separate dead-letter queue for later inspection. |
| R007 | Event-driven | WHEN a send operation is processed, the system shall emit a structured log line containing request id, user id (when applicable), template id, result, and delivery duration. |
| R008 | Conditional | IF a send request references an unknown template id, THEN the system shall reject the request before it is enqueued. |
| R009 | Ubiquitous | The system shall include at least one non-business example template that exercises the send-to-delivery flow end to end. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Log lines emitted by send operations shall contain only identifiers — never the rendered email body nor the full content of template variables. |
| NF002 | A transient provider outage shall not lose messages: the queue shall retain unprocessed messages until the worker can process them, and the dead-letter queue shall capture messages that exhaust their retries. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the worker dequeues a message whose payload fails deserialization, the system shall log the error and discard the message without retrying, so a poison message does not block the queue. |
| EC002 | WHEN the provider responds with a transient error, the system shall return the message to the queue and retry it according to the configured policy. |
| EC003 | WHEN the provider responds with a permanent error (e.g. invalid recipient address or invalid payload), the system shall stop retrying and route the message to the dead-letter queue. |
| EC004 | WHEN the worker is interrupted after a successful provider send but before acknowledging the message to the queue, the system shall re-process the message on redelivery; a duplicate send is accepted in this feature (robust deduplication arrives with NOTIFICATIONS-002). |

## Technical constraints

- **Pattern:** Port & Adapter — a `IEmailNotifier` port with an initial adapter over AWS SES.
- **Templates in code:** templates are defined in code (not in the provider's platform), implemented with React Email.
- **Async delivery via AWS SQS with a dedicated worker:** the consumer use case publishes to the queue and never calls the provider synchronously.
- **Retries and dead-letter queue** are managed by the SQS configuration.
- **Secrets in env vars:** provider credentials and infrastructure ARNs live in environment variables and are never committed to the repo.
- **Independent worker deployment:** the queue-processing component must be deployable and scalable independently of the API.
- **Logging:** use the static Pino logger from `src/shared/infrastructure/logger.ts` with stable structured field names (`requestId`, `userId`, `duration`); do not pass a logger by parameter.
- **Dependency:** SERVICES-001 — the base structure of `apps/services` must exist.
