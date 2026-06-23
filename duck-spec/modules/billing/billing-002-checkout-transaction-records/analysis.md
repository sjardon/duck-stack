# BILLING-002 — Checkout & Transaction Records

## Reason for being

With the abstract payment provider available (BILLING-001), the system can generate payment sessions, but it does not persist them nor associate them with users or organizations. There is no local record of transactions for auditing, idempotency, or historical querying.

This feature enables the frontend to trigger a one-off checkout associated with the authenticated user or organization, persist the local record with its status, and expose query endpoints for transaction retrieval.

## Scope

The requirements cover the creation of a `transactions` Supabase table, three authenticated REST endpoints (`POST /billing/checkout`, `GET /billing/transactions/:id`, `GET /billing/transactions`), an end-to-end idempotency strategy using the local transaction `id` as the provider `reference`, Zod-based input validation, paginated listing, and frontend API client wrappers. The feature integrates with the existing `PaymentProvider` port to call the active provider after persisting the local record.

## Out of scope

- Updating transaction status from webhook events (BILLING-003)
- Refunds (BILLING-004)
- Subscriptions (`subscriptions` module)
- Admin listing/export of transactions (internal dashboard)
- Multi-currency conversion

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a Supabase `transactions` table with columns `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `provider` (text), `provider_transaction_id` (text nullable), `amount` (numeric), `currency` (text), `status` (text constrained to `pending` \| `approved` \| `failed` \| `refunded`), `description` (text), `reference` (text unique), `metadata` (jsonb), `failure_reason` (text nullable), `created_at`, and `updated_at`. |
| R002 | Event-driven | WHEN an authenticated client sends `POST /billing/checkout` with valid `amount`, `currency`, `description`, optional `items` and optional `metadata`, the system shall insert a new row into `transactions` with `status = 'pending'` associated with the requester's `user_id` and (when present) `org_id`. |
| R003 | Event-driven | WHEN `POST /billing/checkout` has persisted the local transaction, the system shall call the active `PaymentProvider.createCheckout` with `reference` equal to the local transaction `id`. |
| R004 | Event-driven | WHEN the provider successfully returns a checkout session for `POST /billing/checkout`, the system shall respond with `{ checkoutUrl, transactionId }` where `checkoutUrl` redirects the user to the provider UI and `transactionId` is the local transaction `id`. |
| R005 | Conditional | IF the call to the provider during `POST /billing/checkout` fails, THEN the system shall keep the local transaction in `status = 'pending'` with `failure_reason` populated with the provider error message. |
| R006 | Event-driven | WHEN an authenticated client sends `GET /billing/transactions/:id` for a transaction owned by the requester (matching `user_id` or `org_id` from the JWT), the system shall respond with the full local transaction record. |
| R007 | Conditional | IF the transaction requested via `GET /billing/transactions/:id` does not exist, THEN the system shall respond with HTTP 404 and the domain error code `NOT_FOUND`. |
| R008 | Conditional | IF the transaction requested via `GET /billing/transactions/:id` belongs to a different `user_id` or `org_id` than the requester, THEN the system shall respond with HTTP 403 and the domain error code `FORBIDDEN`. |
| R009 | Event-driven | WHEN an authenticated client sends `GET /billing/transactions`, the system shall respond with a paginated list of transactions belonging to the requester's `user_id` or `org_id`, ordered by `created_at` descending. |
| R010 | Ubiquitous | The system shall reject `POST /billing/checkout`, `GET /billing/transactions/:id`, and `GET /billing/transactions` requests with HTTP 401 when `request.userId` is undefined, via the `requireAuth` preHandler. |
| R011 | Ubiquitous | The system shall use the local transaction `id` as the `reference` sent to the provider so that the same identifier serves as the end-to-end idempotency key. |
| R012 | Conditional | IF a `POST /billing/checkout` request carries an `Idempotency-Key` header and a transaction with that key already exists for the requester, THEN the system shall return the existing transaction's `{ checkoutUrl, transactionId }` without creating a new record nor calling the provider again. |
| R013 | Conditional | IF the JWT carries `orgId`, THEN the system shall associate the new transaction with that `org_id`; otherwise the transaction shall only be associated with `user_id`. |
| R014 | Ubiquitous | The system shall expose a frontend API client in `apps/web/src/api/billing.ts` with `createCheckout`, `getTransaction`, and `listTransactions` functions targeting the backend endpoints. |
| R015 | Ubiquitous | The system shall expose shared types `Transaction`, `CreateCheckoutInput`, and `TransactionListResponse` in `@repo/types`. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | All inputs to `POST /billing/checkout` shall be validated with Zod enforcing `amount > 0`, `currency` in whitelist (`ARS`, `USD`), and `description` non-empty; validation failure responds with HTTP 400 and code `VALIDATION_ERROR`. |
| NF002 | The `GET /billing/transactions` endpoint shall accept a `limit` query parameter with a default of 20 and a maximum of 100 (values above the max respond with HTTP 400). |
| NF003 | The `GET /billing/transactions` endpoint shall support cursor-based pagination via a `cursor` query parameter that resumes the listing after a previously returned record. |
| NF004 | The insertion of the local `transactions` row shall complete before the call to the provider, so that any provider failure leaves an auditable local record. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN two concurrent `POST /billing/checkout` requests arrive carrying the same `Idempotency-Key` for the same requester, the system shall return the same `{ checkoutUrl, transactionId }` for both and not create duplicate rows in `transactions`. |
| EC002 | WHEN the user navigates away from the provider UI without completing the payment, the system shall keep the transaction in `status = 'pending'` indefinitely until a webhook updates it (webhook handling is out of scope for this feature). |
| EC003 | WHEN a `POST /billing/checkout` request is authenticated but the JWT does not carry `orgId`, the system shall create the transaction with `org_id = NULL` and `user_id` set to the requester. |
| EC004 | WHEN the provider call during `POST /billing/checkout` raises a `ProviderError`, the system shall respond with the same `statusCode` and `code` carried by the error (502 for upstream/transient failures, 400 for provider validation) and persist `failure_reason` on the local transaction. |
| EC005 | WHEN `GET /billing/transactions` is invoked by a requester whose JWT carries `orgId`, the system shall list transactions where `org_id` matches the requester's `orgId`; otherwise it shall list transactions where `user_id` matches `request.userId` and `org_id IS NULL`. |
| EC006 | WHEN `POST /billing/checkout` is called with `amount <= 0`, an unsupported `currency`, or an empty `description`, the system shall respond with HTTP 400 and code `VALIDATION_ERROR` without inserting any row in `transactions`. |
| EC007 | WHEN `GET /billing/transactions` receives a malformed or expired `cursor`, the system shall respond with HTTP 400 and code `VALIDATION_ERROR`. |

## Technical constraints

- Backend module under `apps/services/src/modules/billing/` with `routes.ts`, `repository.ts`, and `service.ts`.
- Frontend client under `apps/web/src/api/billing.ts` exposing `createCheckout`, `getTransaction`, and `listTransactions`.
- Shared types `Transaction`, `CreateCheckoutInput`, and `TransactionListResponse` added to `@repo/types`.
- Supabase migration for the `transactions` table added under `apps/services/supabase/migrations/`.
- Database access uses the existing `postgres.js` singleton in `shared/infrastructure/db.ts` (no `@supabase/supabase-js` runtime dep).
- Provider integration must go through the `PaymentProvider` port (no direct Mobbex coupling).
- Endpoints opt into authentication via the existing `requireAuth` preHandler; no global auth enforcement is added.
- Domain errors must extend `DomainError` from `shared/errors.ts` (`NotFoundError`, `ForbiddenError`, `ValidationError`, `ProviderError`).

## Dependencies

- BILLING-001 — `PaymentProvider` port and Mobbex adapter.
- AUTH-001 — `requireAuth` preHandler.
- AUTH-002 — `users` and `organizations` tables for foreign keys.
