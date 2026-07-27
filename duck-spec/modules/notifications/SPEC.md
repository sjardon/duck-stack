# notifications — Functional Spec

Living spec of the current functional state of the `notifications` module. For requirements history see `duck-spec/modules/notifications/FEATURES.md`.

## Email core (NOTIFICATIONS-001)

The module exposes a typed, provider-agnostic port for sending transactional email, decoupled from the concrete provider and from the delivery mechanics.

### Send port

`IEmailNotifier` (`apps/services/src/modules/notifications/providers/interfaces/iEmailNotifier.ts`) exposes a single generic `send<K extends EmailTemplateId>(templateId, variables, recipient)` method. The generic ties `variables` to the exact shape declared for `templateId` in `EmailTemplateVariables`, so the compiler rejects a call whose variables do not match the selected template in name or type.

Templates are defined in code, not in the provider's platform, and implemented with React Email. The registry (`modules/notifications/templates/emailTemplateRegistry.ts`) maps each `EmailTemplateId` to its `subject`/`render` pair and exposes `isKnownEmailTemplate` for the runtime check that a non-literal `templateId` still needs. The module ships one non-business example template, `example.ping` (`examplePingEmail.tsx`), that exercises the send-to-delivery flow end to end; no business templates (welcome, receipt, etc.) exist yet — those arrive as tasks inside the consuming modules' own features.

### Producer adapter

`SqsEmailNotifier` is the only implementation of `IEmailNotifier`. On `send()` it validates the template id (rejecting unknown ids with `ValidationError` before anything is enqueued), builds an `EmailSendMessage` envelope correlated with the current request's `requestId` (or a generated one outside a request), and publishes it to `notificationsConfig.emailQueueUrl` via SQS. It awaits only the enqueue acknowledgment and returns — it never calls the email provider synchronously. `resolveEmailNotifier()` lazily builds and caches the singleton adapter, failing fast if the queue URL is unset; no module currently calls it, since real wiring with `auth`/`billing`/`subscriptions` is out of scope for this feature.

### Delivery worker

Actual delivery happens exclusively in a separate long-running process, `apps/services/src/worker.ts`, deployable and scalable independently of the API. It long-polls the SQS queue (`emailWorker.ts`) and, per message: discards malformed envelopes without retrying (logged, not re-enqueued); otherwise renders the template and calls `SesEmailSender` (the `IEmailSender` adapter over AWS SES) through `DeliverEmailUseCase`. Every processed message emits one structured log line (`requestId`, `userId`, `templateId`, `result`, `duration`) — log lines never include the rendered HTML, the subject, or template variables.

Retry and dead-letter handling: a transient provider error leaves the message un-acked so SQS's visibility timeout redelivers it, and the queue's redrive policy moves it to the DLQ once retries are exhausted. A permanent provider error (invalid recipient, invalid payload) is forwarded straight to the dead-letter queue and removed from the source queue immediately, without waiting for the redrive count. A crash between a successful provider send and the queue acknowledgment causes redelivery and an accepted duplicate send — deduplication is not implemented in this feature.

### Configuration

`shared/configs/notificationsConfig.ts` reads `AWS_REGION`, `NOTIFICATIONS_EMAIL_QUEUE_URL`, `NOTIFICATIONS_EMAIL_DLQ_URL`, `NOTIFICATIONS_SES_FROM_ADDRESS`, and `NOTIFICATIONS_SQS_POLL_WAIT_SECONDS`. Provisioning of the SQS queue, DLQ, and redrive policy themselves is external infrastructure, not owned by this module.

### Out of scope (planned in later features)

- Persistence of send history and final delivery states, and consumption of provider delivery/bounce/complaint webhooks — `NOTIFICATIONS-002`.
- Suppression list and automatic suppression on bounces/complaints — `NOTIFICATIONS-003`.
- Channels other than email, additional provider adapters, i18n, multi-tenant template overrides, scheduled sends, attachments, and template-management UI.
