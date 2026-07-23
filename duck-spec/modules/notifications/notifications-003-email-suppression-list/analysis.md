# NOTIFICATIONS-003 — Email Suppression List

## Reason for being

With delivery tracking in place (NOTIFICATIONS-002), the system knows which recipient addresses bounce permanently or report spam, yet it keeps attempting to send to them. AWS SES penalizes the account's reputation — and can suspend sending entirely — when bounce and complaint rates cross certain thresholds.

This feature maintains a list of suppressed addresses, feeds it automatically from permanent-bounce and complaint events, and prevents any request destined for a suppressed address from being dispatched to the provider.

## Scope

The requirements cover a persistent, deployment-global suppression list keyed by email address, its automatic population from the SES webhook's permanent-bounce and complaint events, and a pre-dispatch check in the delivery worker that short-circuits sends to suppressed addresses by transitioning the delivery record to a new `suppressed` state. The list stores the suppression reason and timestamp per address and treats repeat suppressions of an already-listed address as an update rather than a duplicate.

## Out of scope

- UI or endpoint to manage the list (query, add manually, remove).
- Automatic expiration of entries (suppressions are permanent in this feature).
- Per-organization scoping — the list is global for the deployment.
- Synchronization with the AWS SES native suppression list.
- Re-activation of addresses via double opt-in.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall maintain a suppression list of email addresses, each entry recording the suppression reason and the timestamp at which the address was added. |
| R002 | Event-driven | WHEN the SES webhook receives a permanent bounce or a complaint event, the system shall add the event's recipient email address to the suppression list. |
| R003 | Event-driven | WHEN the worker is about to dispatch a send to the provider, the system shall query the suppression list for the recipient address before calling the provider. |
| R004 | Conditional | IF the recipient address is present in the suppression list, THEN the system shall transition the delivery record to the `suppressed` state and the worker shall not call the provider. |
| R005 | Conditional | IF an address being added to the suppression list already has an existing entry, THEN the system shall update the existing entry instead of creating a duplicate. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The suppression-list query shall execute before dispatch to the provider without adding perceptible latency to the worker's per-message processing. |
| NF002 | Insertion from the webhook shall be idempotent: the same event received twice shall produce neither an error nor a duplicate entry. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the webhook receives a transient (soft) bounce event, the system shall NOT add the recipient address to the suppression list — only permanent bounces trigger suppression. |
| EC002 | WHEN a request that was enqueued before its recipient address was suppressed reaches the worker after suppression, the system shall detect the suppression and record the delivery as `suppressed` without calling the provider. |
| EC003 | WHEN a complaint arrives for a delivery record already in the `sent` or a terminal state, the system shall add the recipient address to the suppression list while leaving the original delivery record's state unchanged. |
| EC004 | WHEN multiple send requests target the same newly-suppressed address in parallel, the system shall resolve every one of them to the `suppressed` state. |

## Technical constraints

- An `email_suppressions` table in Supabase with the email address as a unique key.
- A new `suppressed` state is added to the `email_deliveries` lifecycle.
- Depends on NOTIFICATIONS-001 (worker-based send flow must exist) and NOTIFICATIONS-002 (the `email_deliveries` table and the provider-event webhook must exist).
