# NOTIFICATIONS-001 — Core de envío de email transaccional (in-process) + email de bienvenida

## Reason for being

The backend (`apps/services`) has modules that need to communicate with users by email (welcome, transactional notices), but today there is no mechanism to do so. A simple, reusable email notification core is needed so any module can trigger an email without blocking its own flow and without knowing the concrete delivery provider.

This feature gives backend modules a way to send transactional emails asynchronously (fire-and-forget, without awaiting delivery), using templates identified by an id and filled with context variables supplied by the consuming module. As the first real consumer that validates the core end-to-end, a welcome email is sent to a user upon account creation.

## Scope

The requirements cover a non-blocking, in-process email send capability behind an abstract port: accepting a send request keyed by a template id and typed context, rendering the template to HTML and plain text, and delivering it to a recipient through an email provider adapter. They also cover fault isolation (failures never propagate to the caller) and the first consumer wiring: dispatching a welcome email when a Clerk `user.created` webhook is received.

## Out of scope

- Delivery-state tracking, bounces, complaints, or opens (email-provider webhook).
- Durable queue, persistent retries, or a separate worker (e.g. SQS + worker).
- User notification preferences, subscription/opt-out, or muting.
- Other notification channels (SMS, push, in-app).
- Deferred scheduling or batch sending (scheduling / batching).
- Email attachments.
- Admin UI or template preview.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a consumer module requests an email send providing a template id and a typed context, the system shall return control to the caller without waiting for delivery to complete (non-blocking send). |
| R002 | Event-driven | WHEN an email send request is processed, the system shall render the template matching the given id, filled with the provided context variables, producing both an HTML version and a plain-text version. |
| R003 | Event-driven | WHEN an email has been rendered, the system shall deliver it to the specified recipient through the email provider. |
| R004 | Conditional | IF an email send is requested with a template id that does not exist, THEN the system shall write a log entry and allow the caller's flow to continue without throwing. |
| R005 | Conditional | IF rendering or delivery of an email fails, THEN the system shall log the failure and shall not propagate the error to nor interrupt the calling module's flow. |
| R006 | Event-driven | WHEN a Clerk `user.created` webhook is received, the system shall send a welcome email to the new user's email address. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The send operation shall not add perceptible latency to the calling module's flow — it is dispatched fire-and-forget within the same process, and the caller's request completes independently of delivery. |
| NF002 | No failure or slowness of the email provider shall degrade or interrupt the request of the module that originated the send. |
| NF003 | The system shall not write sensitive data or PII from the email body to the log, in accordance with the backend logging policy. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a send is requested with a template id that is not registered, the system shall write a log entry identifying the missing template id and return control to the caller without throwing. |
| EC002 | WHEN a send is requested with a missing or malformed recipient address, the system shall write a log entry, attempt no delivery, and not interrupt the caller's flow. |
| EC003 | WHEN the email provider responds with an error or times out, the system shall log the original provider error (with stack) and take no action affecting the caller, which has already continued. |
| EC004 | WHEN a consumer attempts to invoke a template with incomplete or incorrect context variables, the system shall reject it at compile time via the typed context (the code fails TypeScript compilation). Assumption: enforcement is compile-time only; no runtime validation of context completeness is required by this feature. |
| EC005 | WHEN a duplicate `user.created` event is received for a user that already exists, the system shall not dispatch an additional welcome email for that user. Assumption: de-duplication relies on the welcome dispatch being tied to first-time user creation in the `user.created` handler; no durable idempotency store is introduced (out of scope). |

## Technical constraints

- In-process fire-and-forget send: no SQS queue and no separate worker process. The backend runs as a single process on App Runner.
- Email provider is AWS SES v2 (`@aws-sdk/client-sesv2`), behind an adapter that implements an abstract send port. Consumers never import the concrete adapter directly.
- The abstract email-notification port is exposed from `@repo/types` and consumed by modules via constructor injection, mirroring the `PaymentProvider` port / `MobbexProvider` adapter pattern in the `billing` module. Consumers depend on the abstraction, not the concrete provider, so swapping providers requires no consumer changes.
- Template context must be typed, so a consumer cannot invoke a template with incorrect or incomplete variables (enforced at compile time).
- Templates are built with React Email (`.tsx` components) identified by id, rendered server-side to HTML and plain text (`render` from `react-email`, primitives from `@react-email/components`).
- New typed config under `src/shared/configs/` for the SES region and sender address; no direct `process.env` reads outside config files.
- The welcome-email dispatch is wired into the user-creation flow driven by the Clerk `user.created` webhook.
- SES requires a verified identity and the `ses:SendEmail` IAM permission on the App Runner instance role (not yet managed in Terraform per INFRASTRUCTURE.md).
