# billing — Module Specification

Living functional specification of the billing module. Describes current behavior, not planned behavior.

---

## Payment provider abstraction (BILLING-001)

The billing module exposes a `PaymentProvider` port (interface) defined in `@repo/types`. All business logic interacts with the port only, never with a concrete vendor directly.

The active provider is resolved at boot time by `resolveProvider()` in `apps/services/src/modules/billing/providers/resolveProvider.ts`. It reads `BILLING_PROVIDER` from the environment (default `mobbex`) and returns a cached singleton. If the provider name is unknown or required credentials are absent, the function throws immediately so the HTTP server never starts.

### Supported operations

The `PaymentProvider` port declares five operations:

| Operation | Description |
|-----------|-------------|
| `createCheckout` | Creates a one-off checkout session and returns a redirect URL |
| `queryTransaction` | Returns a canonicalized `TransactionStatus` for a provider transaction ID |
| `createSubscription` | Creates a recurring subscription for a plan/subscriber pair |
| `cancelSubscription` | Cancels an active subscription |
| `verifyWebhook` | Authenticates an incoming webhook and returns a canonicalized `WebhookEvent` |

### MobbexProvider adapter

The only currently implemented adapter is `MobbexProvider` (`apps/services/src/modules/billing/providers/MobbexProvider.ts`), targeting the Mobbex HTTP API (Argentina/LATAM market).

Credentials are read exclusively from server-side environment variables (`MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_WEBHOOK_SECRET`) and are never exposed to frontend packages.

Every outbound request sets `X-API-Key` and `X-Access-Token` headers. Requests are wrapped with `AbortController` enforcing a configurable timeout (default 10 seconds). HTTP errors are mapped to `ProviderError`: `statusCode 502` for transient/upstream failures (5xx, 401, network errors, timeouts) and `statusCode 400` for provider-reported validation errors (other 4xx).

If `MOBBEX_TEST_MODE` is set to a truthy value the adapter operates in sandbox mode, setting `test: true` on checkout requests.

#### Webhook signature — known security trade-off (EC003)

Mobbex does not provide a native cryptographic signature (e.g., HMAC-SHA256) for webhook payloads. As a consequence, `verifyWebhook` cannot perform a cryptographic verification of the request body.

Instead, authenticity is verified by comparing a shared secret supplied by Mobbex via the `x-mobbex-signature` header (or embedded as a `?secret=...` query string in the webhook URL) against the value of `MOBBEX_WEBHOOK_SECRET` configured in the environment. If the values do not match, `verifyWebhook` throws `ProviderError('Invalid webhook secret', 400)`.

This is a known limitation imposed by the Mobbex platform. Callers should ensure `MOBBEX_WEBHOOK_SECRET` is a long, randomly generated value and that the webhook endpoint is served exclusively over HTTPS.
