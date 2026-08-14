# notifications — Module Specification

Living functional specification of the notifications module. Describes current behavior, not planned behavior.

---

## Email notification core + welcome email (NOTIFICATIONS-001)

The notifications module exposes an `EmailNotifier` port (interface) defined in `@repo/types`. Consumer modules interact with the port only, never with a concrete email provider directly, mirroring the `PaymentProvider`/`MobbexProvider` shape from `billing`.

`EmailNotifier` declares a single generic method: `send<T extends EmailTemplateId>(input: SendEmailInput<T>): void`. Its `void` return type is the non-blocking contract: the caller never awaits it, so nothing about email rendering or delivery can add latency to or interrupt the caller's flow, regardless of provider outcome.

`SendEmailInput<T>` ties the literal `templateId` to the shape of `context` via `EmailTemplateContextMap[T]` (also in `@repo/types`), so invoking a template with an incomplete or incorrect context fails at `tsc` compile time rather than at runtime.

### Templates

Templates live under `apps/services/src/modules/notifications/templates/` and are built with React Email (`.tsx` components), rendered server-side to both an HTML and a plain-text version via `render()` from `react-email`.

- `emailTemplateRegistry.ts` maps each `EmailTemplateId` to its `{ subject, Component }`. Today the only registered id is `welcome` (`welcomeEmail.tsx`).
- `renderEmailTemplate(templateId, context)` looks the id up in the registry and returns `undefined` when it is not registered — this is the mechanism that lets an unknown template id be handled without throwing.

### Resend adapter

`ResendEmailNotifier` (`apps/services/src/modules/notifications/providers/resendEmailNotifier.ts`) is the only implementation of `EmailNotifier`, delivering through Resend's Node SDK. It is resolved as a singleton by `resolveNotifier()`, which builds the instance from `emailConfig` (Resend API key, sender address) and fails fast at first call if either the API key or the sender address is not configured.

`send()` is the mandatory fire-and-forget wrapper: it invokes a private `dispatch()` without awaiting it and attaches a `.catch()` that logs and stops, so no rejection ever reaches the caller. `dispatch()`:

1. Validates the recipient address; a missing or malformed address is logged and dispatch stops (silent-fail, no delivery attempt).
2. Calls `renderEmailTemplate()`; an unregistered template id is logged (with the template id) and dispatch stops without throwing.
3. Calls `resend.emails.send()` with both the HTML and plain-text bodies. Because the Resend SDK reports API-level failures (invalid API key, unverified sender domain, rate limit) by resolving with a truthy `error` field instead of rejecting, `dispatch()` treats that field as a thrown value so both a rejected promise and an SDK-returned error funnel through the same `catch`, which logs the original error and re-throws it as `ProviderError`, swallowed by `send()`'s wrapper.

No log line emitted by `ResendEmailNotifier` includes the recipient address, template context, subject, or rendered body — only the template id and, on failure, the error.

Only one `EmailNotifier` adapter is wired at a time — `SesEmailNotifier` and the `@aws-sdk/client-sesv2` dependency it used are removed from the codebase (NOTIFICATIONS-002).

### Welcome email

On the Clerk `user.created` webhook, `dispatchClerkEvent` calls `notifier.send({ templateId: 'welcome', to, context: { recipientName } })` after the existing user-upsert/metadata steps, without awaiting it. This call lives only in the `user.created` branch (not `user.updated`), so a duplicate `user.created` event for an existing user does not trigger an additional welcome email. `EmailNotifier` is instantiated once via `resolveNotifier()` at plugin registration in `apps/services/src/modules/webhooks/clerk/routes.ts` and passed into every `dispatchClerkEvent` call.

### Out of scope (current state)

The module does not yet track delivery state, bounces, complaints, or opens; has no durable queue or worker (sends are in-process, fire-and-forget, within the single backend process); has no user notification preferences or opt-out; supports no channel other than email; and has no scheduling, batching, attachments, or admin/preview UI.
