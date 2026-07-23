# NOTIFICATIONS-001 — Email Core: Port, SES Adapter, Async Delivery

## Problem statement

The stack has no mechanism to emit transactional email, and `auth` (implemented) plus `billing`/`subscriptions` (planned) all need one. There is no convention for where templates live, how a send is requested, or how delivery actually happens, so every future consumer would otherwise invent its own coupling to a concrete provider. This feature builds the base `notifications` module: a typed, provider-agnostic send port, code-defined templates, and asynchronous delivery via a queue and dedicated worker.

## Alternatives

| Alternative | Description | Decision |
|---|---|---|
| A — Single `IEmailNotifier` port (SQS-backed) with native SQS redrive + explicit DLQ forward on permanent errors | One producer-facing port whose only adapter enqueues to SQS; the worker owns a separate `IEmailSender`/SES adapter used only internally. Transient failures rely on SQS visibility-timeout redelivery and the queue's redrive policy; the worker explicitly forwards permanent-error messages straight to the DLQ instead of waiting out the redrive count. | **Chosen** — satisfies R001-R009 with the fewest moving parts, keeps retry/DLQ bookkeeping where the technical constraints say it belongs (SQS configuration), and still gives EC003 ("permanent error stops retrying immediately") a precise mechanism. |
| B — Split `IEmailQueuePublisher`/`IEmailProviderAdapter` ports with application-level retry counting | Two separate interfaces for "enqueue" and "deliver," with the worker tracking its own attempt counter (e.g. via message attributes) and manually pushing to the DLQ once a configured max is reached, independent of SQS's redrive policy. | Not chosen — duplicates retry bookkeeping that the technical constraints explicitly delegate to SQS configuration ("Retries and dead-letter queue are managed by the SQS configuration"), and the extra port split is not required by any R-ID. Adds complexity without new capability. |
| C — Generic multi-channel `INotificationChannel` dispatcher with a channel-agnostic queue envelope | A single queue message envelope (`{ channel, templateId, variables }`) routed through a channel registry inside the worker, ready for SMS/push/in-app channels beyond email. | Not chosen — analysis.md explicitly lists "channels other than email" as out of scope. Building the abstraction now is scope creep that serves no in-scope R-ID and adds indirection with no current consumer. |

## Chosen solution

**A — Single `IEmailNotifier` port (SQS-backed) with native SQS redrive + explicit DLQ forward on permanent errors**

- `IEmailNotifier` gives consumers a single typed method (R001) whose generic signature makes the compiler reject a `variables` argument that does not match the selected template exactly (R002).
- The only implementation of `IEmailNotifier` enqueues to SQS and returns as soon as the enqueue call resolves — it never calls the provider (R003, and the "consumer use case ... never calls the provider synchronously" constraint).
- Actual delivery happens exclusively inside a separate long-running worker process (`src/worker.ts`), started and scaled independently of the API (R004, "independent worker deployment" constraint).
- Retries and the dead-letter queue are primarily an SQS configuration concern (visibility timeout + redrive policy = R005/R006/NF002/EC002), with one explicit application-level exception: when the provider reports a *permanent* error, the worker forwards the message straight to the DLQ and deletes it from the source queue instead of waiting for the redrive policy's `maxReceiveCount` to be exhausted (EC003). This reuses the existing `ProviderError` convention (`statusCode 400` = provider-reported/permanent, `502` = transient) exactly as `MobbexProvider` already does, so no new error type is introduced.
- The port and its adapter live inside `src/modules/notifications/`, not `src/shared/providers/`, mirroring the existing precedent of `PaymentProvider`/`resolveProvider()` in `modules/billing/providers/`, which `modules/subscriptions` already imports directly. Future consumers (auth, billing, subscriptions) are expected to import `resolveEmailNotifier()` from `modules/notifications/providers/` the same way `modules/subscriptions` imports `resolveProvider()` from `modules/billing/providers/` today — no such wiring is added in this feature (explicitly out of scope).
- Provisioning the actual SQS queue, DLQ, and redrive policy is treated as external infrastructure (analogous to how `mobbexConfig` only reads credentials for an already-provisioned Mobbex account). `duck-spec/docs/INFRASTRUCTURE.md` has no SQS section yet, and analysis.md's technical constraints do not mention Terraform; this design's Files section is therefore limited to `apps/services` application code that reads queue/DLQ URLs from config.
- SOLID/`ds-context` sections consulted: Stack, App architecture, Coding conventions, Logging strategy, Domain error model, Error handling rules, Feature module structure (+ Repository interface pattern), Configuration, Tests, Scripts, Webhook modules (checked, not applicable — this feature adds no HTTP route), Security plugins (checked, not applicable), Database client (checked, not applicable — this feature persists nothing; NOTIFICATIONS-002 owns persistence).

## Technical design

### Port & entities

```ts
// modules/notifications/templates/emailTemplateRegistry.ts
export const EMAIL_TEMPLATE_IDS = ['example.ping'] as const;
export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

export interface EmailTemplateVariables {
  'example.ping': { recipientName: string; sentAt: string };
}

export interface EmailTemplateDefinition<K extends EmailTemplateId> {
  subject: (variables: EmailTemplateVariables[K]) => string;
  render: (variables: EmailTemplateVariables[K]) => Promise<string>; // rendered HTML
}

export const emailTemplateRegistry: { [K in EmailTemplateId]: EmailTemplateDefinition<K> };
export function isKnownEmailTemplate(id: string): id is EmailTemplateId;
```

```ts
// modules/notifications/providers/interfaces/iEmailNotifier.ts
export interface IEmailNotifier {
  send<K extends EmailTemplateId>(
    templateId: K,
    variables: EmailTemplateVariables[K],
    recipient: { to: string; userId?: string },
  ): Promise<void>;
}
```

The generic constrains `variables` to `EmailTemplateVariables[K]` for the exact `K` inferred from the literal `templateId` argument passed at the call site: TypeScript's excess-property checking on object literals rejects extra keys, and structural typing rejects missing/mismatched-type keys — this is what satisfies R002 at compile time. `emailTemplateRegistry`/`isKnownEmailTemplate` give the runtime check needed for R008, independent of the compile-time guarantee (a caller can still reach the adapter with a non-literal string).

```ts
// modules/notifications/entities/emailSendMessage.ts
export interface EmailSendMessage<K extends EmailTemplateId = EmailTemplateId> {
  requestId: string;
  templateId: K;
  variables: EmailTemplateVariables[K];
  to: string;
  userId?: string;
}
```

This is the SQS message envelope — the wire format between the producer (`SqsEmailNotifier`) and the worker.

### Producer adapter (consumer-facing)

`SqsEmailNotifier implements IEmailNotifier` (`modules/notifications/providers/sqsEmailNotifier.ts`):

1. Validates `templateId` via `isKnownEmailTemplate`; throws `ValidationError` immediately, before any SQS call, if unknown (R008).
2. Builds the `EmailSendMessage` envelope. `requestId` is taken from `requestContext.getStore()?.requestId` when the call happens inside an HTTP request (correlates with the request that triggered the send); falls back to a freshly generated UUID otherwise, so the worker's later log lines can always be tied back to this send even when it originated outside a request.
3. Publishes with `SendMessageCommand` (`@aws-sdk/client-sqs`) to `notificationsConfig.emailQueueUrl`. `await`s only the enqueue acknowledgment, then returns (R003, R004 — delivery is not attempted here).
4. On an SQS client error, logs and re-throws a `ProviderError` (`statusCode 502`) with `originalError` set, per the repository/adapter try/catch rule.

`resolveEmailNotifier()` (`modules/notifications/providers/resolveEmailNotifier.ts`) mirrors `resolveProvider()`: fails fast with a descriptive `Error` if `notificationsConfig.emailQueueUrl` is unset, otherwise lazily builds and caches a singleton `SqsEmailNotifier` backed by an `SQSClient`. This is what a future consumer module will call — no call site is added in this feature.

### Worker & delivery

`IEmailSender` (`modules/notifications/providers/interfaces/iEmailSender.ts`) — the delivery-side port, consumed only by the worker:

```ts
export interface EmailMessage { to: string; subject: string; html: string }
export interface IEmailSender { send(message: EmailMessage): Promise<void> }
```

`SesEmailSender implements IEmailSender` (`modules/notifications/providers/sesEmailSender.ts`) calls `SendEmailCommand` (`@aws-sdk/client-ses`). On failure it classifies the SES SDK error: known permanent SES error names (`MessageRejected`, `MailFromDomainNotVerifiedException`, `ConfigurationSetDoesNotExistException`) become `ProviderError(..., 400, error)`; anything else (throttling, 5xx, network/timeout) becomes `ProviderError(..., 502, error)`. This mirrors the existing `ProviderError` 400-vs-502 convention.

`DeliverEmailUseCase` (`modules/notifications/useCases/deliverEmailUseCase.ts`) — pure business logic, no queue/framework dependency, constructed with an `IEmailSender`:

```ts
class DeliverEmailUseCase {
  constructor(private readonly sender: IEmailSender) {}
  async execute(message: EmailSendMessage): Promise<void>; // renders via emailTemplateRegistry, calls sender.send; logs + re-throws on failure (default use-case catch outcome)
}
```

`emailWorker.ts` (`modules/notifications/worker/emailWorker.ts`) is the queue-processing orchestrator (the worker's equivalent of a "handler" — it wires the repository-like dependency and the use case per invocation):

- `startEmailWorker()` — long-poll loop (`ReceiveMessageCommand`, `WaitTimeSeconds` from config), stops on `SIGINT`/`SIGTERM`, delegates each received message to `processMessage()`.
- `parseEnvelope(body)` — `JSON.parse` + `EmailSendMessageSchema.safeParse`; failure is reported as a discriminated result, never thrown.
- `processMessage(sqsClient, rawMessage)`:
  - If `parseEnvelope` fails → log the error (message id only, no body) and `DeleteMessageCommand` the message without retrying (EC001 — poison message).
  - Otherwise, wraps processing in `requestContext.run({ requestId: message.requestId }, ...)` so every log line during this message's processing is correlated the same way an HTTP request's log lines are (per the existing `AsyncLocalStorage` logging convention), instantiates `SesEmailSender` + `DeliverEmailUseCase` and calls `execute(message)`, measuring duration around the call:
    - **Success** → log `info` with `{ requestId, userId, templateId, result: 'sent', duration }` (R007) and delete the message (ack).
    - **`ProviderError` with `statusCode 400`** (permanent) → log `error` with `{ ..., result: 'permanent_failure', duration }`, forward the original message body to `notificationsConfig.emailDeadLetterQueueUrl` via `SendMessageCommand`, then delete it from the source queue (EC003, R006).
    - **Any other error** (transient) → log `warn` with `{ ..., result: 'transient_failure', duration }` and intentionally do **not** delete the message — SQS's visibility timeout returns it to the queue for redelivery (EC002), and the queue's redrive policy (`maxReceiveCount`) automatically moves it to the DLQ once retries are exhausted (R005, R006, NF002).
  - None of these log lines ever include `variables`, the rendered `html`, or the `subject` — only identifiers and the `result`/`duration` (NF001).
- A duplicate delivery caused by a crash between a successful SES call and the SQS delete (EC004) is accepted as-is per the technical scope of this feature; no dedup key is introduced (deferred to NOTIFICATIONS-002).

### Example template (R009)

`examplePingEmail.tsx` exports `ExamplePingEmail({ recipientName, sentAt })`, a minimal React Email component (plain JSX, no extra component library) rendered by `@react-email/render`'s `render()`. `emailTemplateRegistry['example.ping']` wires `subject`/`render` to it. This is the template exercised end-to-end by the worker tests and is not tied to any business flow.

### Configuration

`shared/configs/notificationsConfig.ts` (new config file, per the "no `process.env` outside config files" rule):

```ts
export const notificationsConfig = {
  awsRegion: env.AWS_REGION ?? 'us-east-1',
  emailQueueUrl: env.NOTIFICATIONS_EMAIL_QUEUE_URL ?? '',
  emailDeadLetterQueueUrl: env.NOTIFICATIONS_EMAIL_DLQ_URL ?? '',
  sesFromAddress: env.NOTIFICATIONS_SES_FROM_ADDRESS ?? '',
  sqsPollWaitTimeSeconds: parseInt(env.NOTIFICATIONS_SQS_POLL_WAIT_SECONDS ?? '20', 10),
};
```

### Flow

```mermaid
sequenceDiagram
    participant Consumer as Consumer use case (future feature)
    participant Notifier as SqsEmailNotifier (IEmailNotifier)
    participant Queue as SQS email queue
    participant Worker as emailWorker (processMessage)
    participant Deliver as DeliverEmailUseCase
    participant SES as SesEmailSender (AWS SES)
    participant DLQ as SQS dead-letter queue

    Consumer->>Notifier: send(templateId, variables, {to, userId})
    Notifier->>Notifier: isKnownEmailTemplate? (else ValidationError, R008)
    Notifier->>Queue: SendMessageCommand(envelope)
    Notifier-->>Consumer: resolves (R003)
    Queue-->>Worker: ReceiveMessageCommand
    Worker->>Worker: parseEnvelope (EC001: discard on failure, no retry)
    Worker->>Deliver: execute(message)
    Deliver->>SES: send({to, subject, html})
    alt delivered
        SES-->>Deliver: ok
        Worker->>Worker: log result=sent (R007)
        Worker->>Queue: DeleteMessageCommand (ack)
    else transient ProviderError(502)
        SES-->>Deliver: throws
        Worker->>Worker: log result=transient_failure (R007)
        Note over Worker,Queue: message left un-acked; SQS redelivers (EC002),<br/>redrive policy moves it to DLQ once exhausted (R005/R006/NF002)
    else permanent ProviderError(400)
        SES-->>Deliver: throws
        Worker->>Worker: log result=permanent_failure (R007)
        Worker->>DLQ: SendMessageCommand (forward)
        Worker->>Queue: DeleteMessageCommand (EC003, R006)
    end
```

## Files

| Path | Action | Description |
|---|---|---|
| `apps/services/package.json` | MODIFY | Add `@aws-sdk/client-sqs`, `@aws-sdk/client-ses`, `@react-email/render`, `react`, `react-dom` dependencies; `@types/react`, `@types/react-dom` devDependencies; a `worker` script (`tsx watch src/worker.ts`) mirroring `dev`. |
| `apps/services/tsconfig.json` | MODIFY | Add `"jsx": "react-jsx"` so `.tsx` templates compile. |
| `apps/services/.env.example` | MODIFY | Document `AWS_REGION`, `NOTIFICATIONS_EMAIL_QUEUE_URL`, `NOTIFICATIONS_EMAIL_DLQ_URL`, `NOTIFICATIONS_SES_FROM_ADDRESS`, `NOTIFICATIONS_SQS_POLL_WAIT_SECONDS`. |
| `apps/services/src/shared/configs/notificationsConfig.ts` | CREATE | Typed config object reading the env vars above. |
| `apps/services/src/modules/notifications/templates/examplePingEmail.tsx` | CREATE | Non-business example React Email template (R009). |
| `apps/services/src/modules/notifications/templates/emailTemplateRegistry.ts` | CREATE | `EmailTemplateId`, `EmailTemplateVariables`, `emailTemplateRegistry`, `isKnownEmailTemplate`. |
| `apps/services/src/modules/notifications/entities/emailSendMessage.ts` | CREATE | `EmailSendMessage<K>` queue envelope interface. |
| `apps/services/src/modules/notifications/providers/interfaces/iEmailNotifier.ts` | CREATE | `IEmailNotifier` port. |
| `apps/services/src/modules/notifications/providers/sqsEmailNotifier.ts` | CREATE | `SqsEmailNotifier` — SQS-backed `IEmailNotifier` adapter. |
| `apps/services/src/modules/notifications/providers/resolveEmailNotifier.ts` | CREATE | `resolveEmailNotifier()` fail-fast singleton factory. |
| `apps/services/src/modules/notifications/providers/interfaces/iEmailSender.ts` | CREATE | `IEmailSender`/`EmailMessage` — delivery-side port used only by the worker. |
| `apps/services/src/modules/notifications/providers/sesEmailSender.ts` | CREATE | `SesEmailSender` — AWS SES adapter implementing `IEmailSender`. |
| `apps/services/src/modules/notifications/dtos/emailSendMessageSchema.ts` | CREATE | Zod schema validating the deserialized queue envelope. |
| `apps/services/src/modules/notifications/useCases/deliverEmailUseCase.ts` | CREATE | `DeliverEmailUseCase` — renders the template and calls `IEmailSender`. |
| `apps/services/src/modules/notifications/worker/emailWorker.ts` | CREATE | `startEmailWorker`, `parseEnvelope`, `processMessage` — the queue-consuming worker. |
| `apps/services/src/worker.ts` | CREATE | Standalone process entrypoint for the worker (mirrors `server.ts`). |
| `apps/services/tests/mocks/fakeEmailSender.ts` | CREATE | `FakeEmailSender implements IEmailSender` test fixture. |
| `apps/services/jest.config.ts` | MODIFY | Widen the `transform` key's regex from `^.+\.ts$` to `^.+\.tsx?$` so the `.tsx` example template (`examplePingEmail.tsx`) and any test touching it are transpiled by `ts-jest`; required once `.tsx` sources exist under `src/`. |
| `apps/services/package.json` | MODIFY | Prepend `NODE_OPTIONS=--experimental-vm-modules` to the `test` and `test:watch` scripts; required because `@react-email/render`/React Email ship as native ESM and Jest's default CJS loader cannot `require()` them without this flag. |

## Requirement coverage

| ID | Design decision |
|---|---|
| R001 | `IEmailNotifier.send(templateId, variables, recipient)` — a single typed method any consumer calls; `SqsEmailNotifier` is its concrete implementation. |
| R002 | Generic `send<K extends EmailTemplateId>(templateId: K, variables: EmailTemplateVariables[K], ...)` signature — TypeScript rejects mismatched/missing/extra `variables` keys for the inferred `K` at compile time. |
| R003 | `SqsEmailNotifier.send()` only awaits the `SendMessageCommand` enqueue acknowledgment, then returns — it never calls the provider. |
| R004 | Delivery happens exclusively in `emailWorker.ts` / `DeliverEmailUseCase` / `SesEmailSender`, running in the separate `src/worker.ts` process, never in the code path that issued the send. |
| R005 | On a transient `ProviderError` (502), `processMessage` does not delete the SQS message; SQS's visibility timeout redelivers it per the queue's configured retry policy. |
| R006 | Permanent errors (400) are forwarded to `notificationsConfig.emailDeadLetterQueueUrl` immediately (EC003); transient errors that exhaust the queue's `maxReceiveCount` are moved to the DLQ automatically by the queue's redrive policy. |
| R007 | `processMessage` logs one structured line per outcome via the static logger, always including `requestId`, `userId`, `templateId`, `result`, and `duration`. |
| R008 | `SqsEmailNotifier.send()` calls `isKnownEmailTemplate()` and throws `ValidationError` before any `SendMessageCommand` is issued. |
| R009 | `examplePingEmail.tsx` + its `emailTemplateRegistry['example.ping']` entry, exercised end-to-end by the worker/use-case tests. |
| NF001 | All worker log lines are restricted to `{ requestId, userId, templateId, result, duration }` — `variables`, `subject`, and rendered `html` are never included. |
| NF002 | Un-acked transient failures stay retrievable in the source queue until reprocessed (no message deleted before successful delivery); permanent failures and exhausted transient retries land in the DLQ. |
| EC001 | `parseEnvelope` failures are logged and the message is deleted without retry — never reach `DeliverEmailUseCase`. |
| EC002 | Transient `ProviderError` (502) leaves the message un-acked for SQS redelivery. |
| EC003 | Permanent `ProviderError` (400) is forwarded to the DLQ immediately and deleted from the source queue, skipping further retries. |
