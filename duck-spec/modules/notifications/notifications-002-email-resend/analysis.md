# NOTIFICATIONS-002 — Migración del envío de email a Resend

## Reason for being

NOTIFICATIONS-001 left transactional email working behind an abstract `EmailNotifier` port, with a single concrete adapter (`SesEmailNotifier`) talking to AWS SES v2. When the stack moved off AWS, that adapter lost the infrastructure backing it: the domain identity, the send permission and the runtime variables INFRA-005 was going to provide were never built, and that feature was marked obsolete together with the rest of the AWS infrastructure. As a result the backend cannot send any email today, and it does not even boot: the notifier is resolved during the Clerk webhooks plugin registration, so a missing sender address aborts startup instead of degrading the send.

This feature replaces the email delivery provider with Resend without altering the port consumed by the other modules nor the observable behavior of the send. It is the point where the investment in ports and adapters pays off: the contract the modules consume must not notice the provider change.

## Scope

Requirements cover replacing the SES v2 adapter with a Resend-backed implementation of the same `EmailNotifier` port, delivering the welcome email through Resend with both the HTML and the plain-text variants, configuring the Resend API key and the sender address per environment through the typed config layer, preserving the fire-and-forget fault isolation and logging behavior, and removing the `@aws-sdk/client-sesv2` dependency along with the old adapter so only one notifier implementation stays wired.

Templates, the port contract, the call sites in consumer modules and the service startup semantics regarding missing email configuration all stay exactly as they are. Assumption recorded here: the notifier resolution keeps its current fail-fast behavior when required email configuration is absent — changing that belongs to SERVICES-010.

## Out of scope

- New templates or content changes to the existing ones
- Bounce, complaint and delivery-state handling
- Verification of the sender domain with the provider — a manual DNS procedure
- Durable queue, persisted retries or a separate worker: sending remains in-process
- Changes to the service startup semantics when email configuration is absent (SERVICES-010)
- Delivery observability beyond the log

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a consumer module invokes the email notifier port for the welcome template, the system shall deliver the email to the recipient through Resend. |
| R002 | Ubiquitous | The system shall keep the `EmailNotifier` port signature (`send<T>(input: SendEmailInput<T>): void`) and the way consumer modules invoke it unchanged. |
| R003 | Event-driven | WHEN an email is dispatched, the system shall render the registered template through the existing React Email pipeline and deliver content identical to the one produced before the migration. |
| R004 | Ubiquitous | The system shall read the Resend API key and the sender address from typed configuration under `src/shared/configs/`, so each environment can be configured independently. |
| R005 | Conditional | IF Resend fails to accept a send, THEN the system shall log the failure and neither propagate the error nor interrupt the flow of the calling module. |
| R006 | Ubiquitous | The system shall not depend on `@aws-sdk/client-sesv2`: the dependency is removed from `apps/services/package.json` and no source file imports it. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The send shall not add perceptible latency to the calling module's flow — control returns to the caller before delivery completes. |
| NF002 | No provider failure, timeout or slowness shall degrade or interrupt the request that originated the send. |
| NF003 | No log line emitted by the email adapter shall contain the recipient address, the template context, the subject, or the rendered HTML/text body. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN Resend rejects a send because the sender domain is not yet verified, the system shall log the provider error (template id + error, no PII), swallow it, and still return HTTP 200 for the originating webhook request. |
| EC002 | WHEN the configured Resend API key is invalid, the system shall log one error entry per attempted send containing the provider error, and shall not retry nor surface any failure to the caller (the send is fire-and-forget and no one observes the result). |
| EC003 | WHEN Resend responds with a rate-limit error, the system shall log the provider error and drop that send without retrying or queueing it. |
| EC004 | WHEN an email is sent, the system shall use the sender address supplied by that environment's configuration, with no hardcoded sender address in source, so dev and prod can use different sender addresses. |
| EC005 | WHEN a template is rendered, the system shall pass both the HTML and the plain-text variants to Resend in the same send call — both content fields are populated. |
| EC006 | WHEN the notifier is resolved, the system shall return exactly one active `EmailNotifier` implementation (the Resend adapter); the SES v2 adapter is deleted from the codebase so no path can wire two notifiers and duplicate sends. |

## Technical constraints

- Email provider: Resend, behind the same abstract port the modules already consume.
- The AWS SES v2 adapter is replaced and the `@aws-sdk/client-sesv2` dependency is retired.
- Typed configuration under `src/shared/configs/`; no direct `process.env` reads outside configuration files (BACKEND.md, "Configuration").
- React Email templates and their server-side render to HTML and plain text are kept unchanged.
- The change must not require modifications in the modules that consume the send port — only the notifications module's provider layer, its configuration and its tests are touched.
- Adapter error handling follows BACKEND.md: `try/catch` required on the external call, log the original error and re-throw a `DomainError` (`ProviderError`); the fire-and-forget wrapper on `send()` catches and logs it so nothing escapes to the caller.
- Depends on INFRA-010: the AWS infrastructure must be retired and INFRA-005/INFRA-006 marked obsolete.
