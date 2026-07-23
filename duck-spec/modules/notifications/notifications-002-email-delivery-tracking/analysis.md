# NOTIFICATIONS-002 — Email Delivery Tracking via Provider Webhook

## Reason for being

NOTIFICATIONS-001 leaves the system sending email asynchronously, but with no visibility into what happens to a send beyond the worker's logs. There is no way to know whether the provider actually delivered an email, whether it bounced, or whether the recipient reported it as spam. Diagnosing delivery problems, auditing sends, and — later — feeding the suppression list (NOTIFICATIONS-003) all require the full lifecycle of each send to be persisted.

This feature persists every send request and its final outcome (`delivered` / `bounced` / `complained` / `failed`) by consuming the delivery-event notifications the provider emits, and makes the send idempotent so retries do not produce duplicate dispatches to the provider.

## Scope

The requirements cover persisting a record for every send request at acceptance time, evolving that record's state as the worker dispatches to the provider and as the provider's final delivery-event notifications arrive via an authenticated webhook, and preventing a duplicate dispatch to the provider when the worker reprocesses an already-sent message. Authentication of the provider's webhook notifications and immutability of terminal states are part of this scope.

## Out of scope

- Aggregated metrics, dashboards, or delivery reports.
- Manual retries from a UI or an endpoint.
- Automatic resend of sends in `failed` state.
- Suppression list and auto-suppression on bounces or complaints (NOTIFICATIONS-003).
- Retention and purging of the historical record.
- Exposing the records via an API consumable by the frontend.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a send request is accepted, the system shall persist a record for it in `queued` state. |
| R002 | Event-driven | WHEN the worker dispatches a send to the provider, the system shall transition the corresponding record's state to `sent`. |
| R003 | Event-driven | WHEN the system receives a provider delivery-event notification via webhook, the system shall update the corresponding record's state to `delivered`, `bounced`, `complained`, or `failed` according to the event reported. |
| R004 | Conditional | IF a webhook notification cannot be authenticated as coming from the provider, THEN the system shall reject it with an error response and shall not process its contents. |
| R005 | Conditional | IF the worker reprocesses a queued message for a send that already dispatched successfully to the provider, THEN the system shall not dispatch it to the provider again. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Duplicate provider notifications received for the same send identifier shall not corrupt the persisted state. |
| NF002 | Reprocessing of the same queued message shall not produce a duplicate dispatch to the provider. |
| NF003 | The record for a send shall be persisted at request-acceptance time, not at dispatch time, so a send that is never delivered remains visible for diagnosis. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a provider delivery-event notification for a send arrives before the worker has transitioned that send's record to `sent` (a race between the worker and the webhook), the system shall persist the notification's resulting state on the record, and a later `sent` transition attempted by the worker shall not overwrite that already-applied terminal state. |
| EC002 | WHEN a webhook notification references a send identifier that does not exist in the system, the system shall log the event and discard it without creating or updating any record and without returning an error response. |
| EC003 | WHEN the dispatch to the provider succeeds but the subsequent persistence update to `sent` fails, and the worker reprocesses the same message on the next retry, the system shall detect the identifier already issued by the provider for that send and shall complete the transition to `sent` without dispatching to the provider again. |
| EC004 | WHEN a notification is received for a send whose record is already in a terminal state (`delivered`, `bounced`, `complained`, or `failed`), the system shall discard the notification without modifying the persisted state. |

## Technical constraints

- **Persistence:** Supabase, following the migration convention of the `auth` module.
- **Table:** `email_deliveries`, modeling the lifecycle described above (`queued` → `sent` → `delivered` | `bounced` | `complained` | `failed`).
- **Transport:** provider delivery-event notifications are received via AWS SNS and consumed by a webhook endpoint in `apps/services`.
- **Signature verification:** SNS notification signatures are verified per the official AWS mechanism (no custom/simplified verification).
- **Dependency:** NOTIFICATIONS-001 — the port, the SES adapter, and the SQS-based asynchronous delivery flow must already exist.
- **Dependency:** AUTH-002 — the Supabase CLI setup and the migration convention must already exist.
