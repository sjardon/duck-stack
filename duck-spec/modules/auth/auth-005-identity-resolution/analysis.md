# AUTH-005 — Internal Identity Resolution via JWT Claim

## Reason for being

The `clerkAuthPlugin` currently decorates requests with `request.userId = payload.sub`, where `payload.sub` is the Clerk user ID (format `user_xxx`). Multiple repositories in the `subscriptions` and `billing` modules treat that value as if it were the internal `users.id` UUID when querying and writing FK columns (`subscriptions.user_id`, `transactions.user_id`, `usage_counters.user_id`). These writes fail with FK violations and the queries never match, producing incorrect behavior: subscriptions not found, transactions inaccessible, and quotas permanently reading zero. The same mismatch affects `request.orgId` versus `organizations.id`. The `users` module is unaffected because it queries explicitly by `clerk_user_id`.

The goal is to make `request.userId` and `request.orgId` carry the internal UUIDs (`users.id`, `organizations.id`) instead of the Clerk IDs, so all `subscriptions`, `billing`, and `usage_counters` queries and writes resolve correctly against their FK columns, while preserving access to the raw Clerk IDs for the few cases that need them (such as the `users` module).

## Scope

The requirements cover resolving and exposing the internal user and organization UUIDs on authenticated requests via custom JWT claims, preserving access to the raw Clerk IDs, and handling the webhook-lag window for newly created identities with bounded retries and a 503 fallback. They also cover a dual reliability strategy — blocking metadata writes from the `user.created`/`organization.created` webhooks plus a fire-and-forget lazy backfill in the plugin — that self-heals identities created before this feature and ensures subsequent JWTs carry the resolved claims without additional lookups.

## Out of scope

- Migration of existing rows in `subscriptions`, `transactions`, `usage_counters`, `refunds`, or any other table written with Clerk IDs in UUID columns (pre-production environment assumed; the fix corrects the mismatch going forward).
- In-memory cache (LRU or otherwise) of the Clerk ID → internal UUID translation; the JWT claim already removes the DB hit on the happy path.
- New endpoints for the frontend to query the internal UUID.
- Changes to the frontend signup flow.
- Changes to Supabase RLS or policies.
- `user.deleted` / `organization.deleted` handlers (outside the scope of AUTH-002).
- Manual rotation or refresh of claims by operators; the mapping is immutable by design.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a request carrying a valid JWT is received, the system shall decorate `request.userId` with the internal `users.id` UUID resolved from the JWT instead of the Clerk user ID. |
| R002 | Event-driven | WHEN a request carrying a valid JWT that contains an `org_id` claim is received, the system shall decorate `request.orgId` with the internal `organizations.id` UUID. |
| R003 | Conditional | IF a valid JWT contains no active organization, THEN the system shall set `request.orgId` to `null`. |
| R004 | Ubiquitous | The system shall expose the raw Clerk user ID (`request.clerkUserId`) and the raw Clerk organization ID (`request.clerkOrgId`) to downstream handlers. |
| R005 | Ubiquitous | The system shall continue resolving the `users` module handlers (`GET /users/me`, `PATCH /users/me`, `POST /users/me/onboarding`) by Clerk user ID with no functional regression. |
| R006 | Event-driven | WHEN an authenticated request arrives for a user not yet synced to the local DB (webhook lag), the system shall retry the internal-identity lookup for up to 2 seconds before responding. |
| R007 | Conditional | IF the internal identity is still unresolved after 2 seconds, THEN the system shall respond with HTTP 503 including a `Retry-After` header. |
| R008 | Event-driven | WHEN a request presents a valid JWT that lacks the resolved internal-identity claim for an existing user or organization, the system shall resolve the mapping via a DB lookup and write it back to Clerk `private_metadata` so subsequent JWTs include it without a further lookup. |
| R009 | Event-driven | WHEN the `user.created` or `organization.created` webhook fails to register the internal identity in Clerk metadata, the system shall respond with a 5xx status so Clerk retries the event. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | On the happy path (claim present in the JWT), the request shall add no perceptible latency relative to the current baseline (no DB hit for identity resolution). |
| NF002 | On the degraded path (row missing, with retries), the total time before responding HTTP 503 shall not exceed 2 seconds. |
| NF003 | Retry lookups shall use exponential backoff to avoid a DB dogpile during a webhook-lag spike. |
| NF004 | The lazy-backfill write to Clerk metadata from the plugin shall be fire-and-forget, adding no latency to the request, and its failures shall be logged at `warn` level. |
| NF005 | The Clerk metadata write from the webhook shall be blocking, so a failed write is reflected as a non-2xx webhook response (see R009). |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a request presents a valid JWT whose `app_user_id` claim references a `users` row that was deleted manually, the system shall allow downstream queries to resolve to empty results or HTTP 404 (FKs are `ON DELETE SET NULL`) and shall not raise an unhandled 500. |
| EC002 | WHEN a valid JWT for a user or organization created before this feature lacks the internal-identity claim, the system shall resolve it via a DB lookup on the first request, serve the request successfully, and write the mapping back to Clerk so subsequent JWTs carry the claim. |
| EC003 | WHEN `private_metadata` is edited manually from the Clerk dashboard, the system shall use the claim value as provided without additional validation. (Assumption: risk is partially mitigated by using `private_metadata`, which is not exposed to the frontend and is less accessible from the UI; no extra validation is implemented in this version.) |
| EC004 | WHEN the `user.created` or `organization.created` webhook persistently fails the Clerk metadata write, the system shall return 5xx on each attempt (letting Clerk retry with exponential backoff for ~24h), and the plugin's lazy backfill shall resolve the identity for any request that arrives before the webhook succeeds. |
| EC005 | WHEN a user switches active organization in Clerk, the system shall read `app_org_id` from each new JWT so `request.orgId` reflects the current organization with no stale cached state. |
| EC006 | WHEN multiple concurrent requests from the same newly created (unsynced) user hit the retry path simultaneously, the system shall process each request independently with its own retry lookup and no in-flight deduplication in this version. (Assumption: acceptable for v1; dedup is a future optimization if metrics show dogpile.) |

## Technical constraints

- Custom claims `app_user_id` and `app_org_id` configured in the Clerk JWT template, read from `private_metadata.appUserId` and `private_metadata.appOrgId`.
- Use of `private_metadata` (not `public_metadata`) to reduce dashboard-manipulation surface and avoid exposing the internal ID to the frontend.
- Writes to Clerk metadata via `clerkClient.users.updateUserMetadata` and `clerkClient.organizations.updateOrganizationMetadata` from `@clerk/backend`.
- The `clerkAuthPlugin` decorates the request with `request.userId`, `request.orgId`, `request.clerkUserId`, and `request.clerkOrgId`.
- Dual reliability strategy: (a) the webhook returns 5xx on metadata-write failure; (b) lazy backfill (SELECT + fire-and-forget `updateMetadata`) in the plugin as a safety net.
- The plugin remains compatible with unauthenticated requests (no `Authorization` header) and invalid JWTs: identity-resolution logic applies only when the JWT is valid.
- Dependencies: AUTH-001 (modifies the existing `clerkAuthPlugin`, relies on JWT verification infra) and AUTH-002 (modifies the `user.created`/`organization.created` webhooks, relies on the `users`/`organizations` schema).
