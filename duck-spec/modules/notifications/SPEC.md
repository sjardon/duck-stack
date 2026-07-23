# notifications — Functional Spec

Living spec of the current functional state of the `notifications` module. For requirements history see `duck-spec/modules/notifications/FEATURES.md`.

## Email core (NOTIFICATIONS-001)

The module exposes a typed, provider-agnostic port for sending transactional email, decoupled from the concrete provider and from the delivery mechanics.

### Send port

`IEmailNotifier` (`apps/services/src/modules/notifications/providers/interfaces/iEmailNotifier.ts`) exposes a single generic `send<K extends EmailTemplateId>(templateId, variables, recipient)` method. The generic ties `variables` to the exact shape declared for `templateId` in `EmailTemplateVariables`, so the compiler rejects a call whose variables do not match the selected template in name or type.

Templates are defined in code, not in the provider's platform, and implemented with React Email. The registry (`modules/notifications/templates/emailTemplateRegistry.ts`) maps each `EmailTemplateId` to its `subject`/`render` pair and exposes `isKnownEmailTemplate` for the runtime check that a non-literal `templateId` still needs. The module ships one non-business example template, `example.ping` (`examplePingEmail.tsx`), that exercises the send-to-delivery flow end to end; no business templates (welcome, receipt, etc.) exist yet — those arrive as tasks inside the consuming modules' own features.

### Producer adapter

`SqsEmailNotifier` is the only implementation of `IEmailNotifier`. On `send()` it validates the template id (rejecting unknown ids with `ValidationError` before anything is enqueued), generates a `sendId` and persists a `queued` row for it (see "Delivery tracking" below) before publishing an `EmailSendMessage` envelope — carrying that `sendId` alongside the current request's `requestId` (or a generated one outside a request) — to `notificationsConfig.emailQueueUrl` via SQS. It awaits only the enqueue acknowledgment and returns — it never calls the email provider synchronously. `resolveEmailNotifier()` lazily builds and caches the singleton adapter, injecting the shared `EmailDeliveriesDBRepository`, and fails fast if the queue URL is unset; no module currently calls it, since real wiring with `auth`/`billing`/`subscriptions` is out of scope for this feature.

### Delivery worker

Actual delivery happens exclusively in a separate long-running process, `apps/services/src/worker.ts`, deployable and scalable independently of the API. It long-polls the SQS queue (`emailWorker.ts`) and, per message: discards malformed envelopes without retrying (logged, not re-enqueued); otherwise renders the template and calls `SesEmailSender` (the `IEmailSender` adapter over AWS SES) through `DeliverEmailUseCase`. Every processed message emits one structured log line (`requestId`, `userId`, `templateId`, `result`, `duration`) — log lines never include the rendered HTML, the subject, or template variables.

Retry and dead-letter handling: a transient provider error leaves the message un-acked so SQS's visibility timeout redelivers it, and the queue's redrive policy moves it to the DLQ once retries are exhausted. A permanent provider error (invalid recipient, invalid payload) is forwarded straight to the dead-letter queue and removed from the source queue immediately, without waiting for the redrive count. A crash between a successful provider send and the queue acknowledgment causes redelivery; the resulting duplicate delivery attempt is now deduplicated at the provider-dispatch step (see "Delivery tracking" below) rather than accepted as a duplicate send.

### Delivery tracking (NOTIFICATIONS-002)

Every send request is persisted in the `email_deliveries` Supabase table and evolves through the lifecycle `queued → sent → delivered | bounced | complained | failed`, giving each send a durable, diagnosable record independent of worker logs.

- **Acceptance:** `SqsEmailNotifier.send()` inserts the `queued` row and awaits it *before* enqueueing to SQS, so a send that is accepted but never dispatched still has a visible row.
- **Dispatch:** `DeliverEmailUseCase.execute()` first checks whether the record already has a `provider_message_id` recorded (a prior attempt that reached SES but crashed before finishing its bookkeeping); if so, it skips the SES call entirely and only (re)applies the `sent` transition. Otherwise it calls `SesEmailSender`, which now returns the SES-issued `providerMessageId`, and performs two independent, idempotent writes: `recordProviderMessageId` (guarded by `provider_message_id IS NULL`) followed by `markSent` (guarded by `state = 'queued'`). This two-step, guarded write is what makes a reprocessed queue message safe — the second attempt never re-dispatches to SES, it only retries the state transition.
- **Provider delivery events:** SES is configured to publish delivery/bounce/complaint/reject events to an SNS topic, consumed by a new webhook module, `modules/webhooks/ses` (`POST /webhooks/notifications/ses`), registered before `clerkAuthPlugin` per the webhook-modules convention. The route verifies the inbound SNS notification's signature with `sns-validator` (the AWS-maintained implementation of AWS's official verification mechanism) and additionally checks the notification's `TopicArn` against `notificationsConfig.sesEventsTopicArn`; a notification that fails either check is rejected with a 401 and never reaches the dispatch logic. A `SubscriptionConfirmation` message is handled by fetching its `SubscribeURL` to complete the SNS HTTPS handshake. Valid `Notification` messages are mapped by event type (`Delivery → delivered`, `Bounce → bounced`, `Complaint → complained`, `Reject → failed`; all other event types are logged and ignored) and applied via a single guarded `UPDATE ... WHERE provider_message_id = $1 AND state NOT IN (<terminal>)`, correlating purely on the SES-issued `provider_message_id` — never on `sendId`. This guard makes terminal states immutable: a duplicate or late notification for an already-terminal row, or a notification racing ahead of the worker's own `sent` write, is always a safe no-op, and the worker's later `sent` write never overwrites a terminal state already applied by the webhook. A notification for an unknown `provider_message_id` is logged and discarded without creating a row. The webhook always responds `200` except on authentication failure, regardless of whether the event was applied, discarded as unknown, or discarded as already-terminal.
- **Shared repository:** `email_deliveries` reads and writes are centralized in `EmailDeliveriesDBRepository` (`shared/repositories/`), implementing `IEmailDeliveriesRepository`, since both the producer/worker and the webhook module depend on it.

### Configuration

`shared/configs/notificationsConfig.ts` reads `AWS_REGION`, `NOTIFICATIONS_EMAIL_QUEUE_URL`, `NOTIFICATIONS_EMAIL_DLQ_URL`, `NOTIFICATIONS_SES_FROM_ADDRESS`, `NOTIFICATIONS_SQS_POLL_WAIT_SECONDS`, `NOTIFICATIONS_SES_CONFIGURATION_SET_NAME` (required for SES to publish any event to the SNS topic at all), and `NOTIFICATIONS_SES_EVENTS_TOPIC_ARN`. Provisioning of the SQS queue/DLQ, the SNS topic, the SES configuration set's SNS event destination, and the topic-to-endpoint HTTPS subscription is external infrastructure, not owned by this module.

### Out of scope (planned in later features)

- Suppression list and automatic suppression on bounces/complaints — `NOTIFICATIONS-003`.
- Aggregated delivery metrics/dashboards, manual or automatic resends, retention/purging of `email_deliveries`, and exposing delivery records via a frontend-consumable API.
- Channels other than email, additional provider adapters, i18n, multi-tenant template overrides, scheduled sends, attachments, and template-management UI.
