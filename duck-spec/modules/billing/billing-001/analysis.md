# BILLING-001 — Payment Provider Abstraction & Mobbex Adapter

## Reason for being

The project currently has no payment processing capability. To support a SaaS business model, the platform must be able to charge users while remaining provider-agnostic, since the active payment provider may change over the product's lifetime (Mobbex, Stripe, MercadoPago, etc.) without forcing a rewrite of business logic. The first target provider is Mobbex, focused on the Argentina/LATAM market.

This feature establishes a `PaymentProvider` port (interface) that is independent from any concrete vendor and ships the initial Mobbex adapter implementation. Every other module in the system interacts with the port only, never with Mobbex directly.

## Scope

Defines the `PaymentProvider` port contract and its operations, a boot-time provider selector driven by environment configuration, and the Mobbex adapter implementing the port against the Mobbex HTTP API. Covers credential handling, error mapping to domain errors, timeouts, sandbox/test mode, and webhook signature verification semantics. No persistence, no routes, no UI.

## Out of scope

- Implementation of other providers (Stripe, MercadoPago, PayPal)
- Transaction persistence (BILLING-002)
- Webhook routes and event dispatching (BILLING-003)
- Refunds (BILLING-004)
- Subscriptions (handled in the `subscriptions` module)
- Multi-currency switcher for the end user
- Card tokenization on the frontend (Wallet Transparent)

## Functional requirements

| ID   | EARS type     | Statement |
|------|---------------|-----------|
| R001 | Ubiquitous    | The system shall expose a `PaymentProvider` port that declares operations to create a one-off checkout session, query a transaction status, create a recurring subscription, cancel a subscription, and verify an incoming webhook. |
| R002 | Event-driven  | WHEN the service boots, the system shall read the `BILLING_PROVIDER` environment variable (default `mobbex`) and resolve the active `PaymentProvider` implementation accordingly. |
| R003 | Ubiquitous    | The system shall provide a concrete `MobbexProvider` adapter that implements the `PaymentProvider` port against the Mobbex HTTP API. |
| R004 | Event-driven  | WHEN the `MobbexProvider` issues any request to the Mobbex API, the system shall include the `X-API-Key` and `X-Access-Token` headers populated from `MOBBEX_API_KEY` and `MOBBEX_ACCESS_TOKEN`. |
| R005 | Conditional   | IF `MOBBEX_TEST_MODE` is set to a truthy value, THEN the system shall operate the Mobbex adapter in sandbox/test mode. |
| R006 | Conditional   | IF `BILLING_PROVIDER` points to a provider that is not implemented, THEN the system shall fail at boot with a descriptive error and not start the HTTP server. |
| R007 | Conditional   | IF credentials for the selected provider are missing or empty at boot, THEN the system shall fail at boot with a descriptive error and not start the HTTP server. |
| R008 | Event-driven  | WHEN `verifyWebhook` is invoked on the port, the system shall accept the raw request body and headers and return a canonicalized `WebhookEvent` object containing `type` and `data` for the caller to dispatch. |

## Non-functional requirements

| ID    | Statement |
|-------|-----------|
| NF001 | Provider credentials shall never be transmitted to or accessible from the frontend; they are read only from server-side environment variables. |
| NF002 | Errors returned by the provider shall be mapped to a domain `ProviderError` class with `statusCode 502` for transient/upstream failures and `statusCode 400` for validation errors reported by the provider. |
| NF003 | Calls to the provider HTTP API shall enforce a configurable request timeout with a default of 10 seconds so a slow upstream cannot block the request thread indefinitely. |

## Edge cases

| ID    | Description |
|-------|-------------|
| EC001 | WHEN the provider is unreachable or responds with HTTP 5xx, the system shall surface a `ProviderError` with `statusCode 502` to the caller and shall not retry internally (the caller decides retry policy). |
| EC002 | WHEN the provider responds with HTTP 401 due to invalid credentials, the system shall map the response to a `ProviderError` with `statusCode 502` and include the upstream error code in the error message for diagnosis. |
| EC003 | WHEN a webhook is received, the system shall verify its authenticity using a shared `secret` provided via query string (`?secret=...`) matching `MOBBEX_WEBHOOK_SECRET`, given that Mobbex does not provide a native cryptographic signature for webhooks; this limitation shall be documented in the module SPEC. |
| EC004 | WHEN any code attempts to change `BILLING_PROVIDER` at runtime, the system shall ignore the change and continue using the provider resolved at boot (selection is immutable after boot). |

## Technical constraints

- Backend: new module `apps/services/src/modules/billing/` with a `providers/` sub-module hosting the adapters.
- Shared types in `@repo/types`: `PaymentProvider`, `Money`, `CheckoutInput`, `CheckoutSession`, `TransactionStatus`, `WebhookEvent`.
- Environment variables introduced: `BILLING_PROVIDER`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_TEST_MODE`, `MOBBEX_WEBHOOK_SECRET`.
- Depends on SERVICES-001 — the base `apps/services` structure must already exist.
- Follow conventions in `duck-spec/docs/BACKEND.md` for module layout, domain error model, and fail-fast boot checks.
