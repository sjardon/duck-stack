# SERVICES-002 — Replace Supabase JS client with direct Postgres driver

## Reason for being

The `apps/services` backend currently uses `@supabase/supabase-js` as its database client. That client reaches Postgres through PostgREST's HTTP API, adding a network hop and a heavy runtime dependency to every database operation. No Supabase-specific capability (auth, realtime, storage, RLS) is in use — the SDK is acting purely as a query builder over HTTP.

The goal is to remove `@supabase/supabase-js` as a runtime dependency of `apps/services` and replace every database access (user profile reads and updates, Clerk webhook synchronization) with direct SQL executed through `postgres.js` over a TCP connection to the same Postgres instance hosted in Supabase. Externally observable behavior (HTTP responses, side effects, warnings) must remain identical.

## Scope

Requirements cover the substitution of the data-access layer inside `apps/services`: introducing a `postgres.js`-based client, rewriting the existing repositories (`UserDBRepository`, `ClerkSyncRepository`) and their wiring (handlers, webhook plugin) to use raw SQL while preserving every input/output contract, side effect, and warning behavior currently in place.

## Out of scope

- Modifications to repository interfaces, use cases, route handlers, or HTTP routes
- Database schema changes or migrations
- New queries, endpoints, or functional behaviors
- Changes to other apps in the monorepo (`apps/web`, `apps/landing`)
- Connection pooling tuning, observability dashboards, or new logging beyond what already exists

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall execute all `apps/services` database operations through a `postgres.js` client connected over TCP to the Postgres instance previously accessed via `@supabase/supabase-js`. |
| R002 | Event-driven | WHEN a `GET /users/me` request is handled, the system shall return the same JSON response shape and status codes that the Supabase-backed implementation returned for the same database state. |
| R003 | Event-driven | WHEN a `PATCH /users/me` request is handled, the system shall persist the same column changes and return the same JSON response shape and status codes that the Supabase-backed implementation returned. |
| R004 | Event-driven | WHEN the Clerk webhook handler invokes `upsertUser`, the system shall upsert the `users` row keyed by `clerk_user_id` with the same columns (`email`, `name`, `avatar_url`, `updated_at`) and the same conflict-resolution semantics as the current implementation. |
| R005 | Event-driven | WHEN the Clerk webhook handler invokes `upsertOrganization`, the system shall upsert the `organizations` row keyed by `clerk_org_id` with the same columns (`name`, `slug`, `updated_at`) and the same conflict-resolution semantics as the current implementation. |
| R006 | Event-driven | WHEN the Clerk webhook handler invokes `createMembership`, the system shall resolve the local `users.id` and `organizations.id` via separate lookups by `clerk_user_id` and `clerk_org_id`, then upsert into `organization_members` with `ON CONFLICT (user_id, org_id) DO NOTHING`, matching the current implementation's row-write behavior. |
| R007 | Conditional | IF `createMembership` cannot find a `users` row for the provided `clerk_user_id`, THEN the system shall emit a warning log identifying the missing user (referencing EC005) and skip the membership insert without throwing. |
| R008 | Conditional | IF `createMembership` cannot find an `organizations` row for the provided `clerk_org_id`, THEN the system shall emit a distinct warning log identifying the missing organization (referencing EC005) and skip the membership insert without throwing. |
| R009 | Event-driven | WHEN the application starts, the system shall fail to boot with a descriptive error if the Postgres connection environment variable required by the new driver is missing or empty. |
| R010 | Ubiquitous | The system shall not import or instantiate `@supabase/supabase-js` from any runtime module in `apps/services`. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | All database queries originating from `apps/services` shall use a direct TCP connection to Postgres, with no intermediate HTTP layer (PostgREST or otherwise). |
| NF002 | `@supabase/supabase-js` shall not appear in the runtime dependencies of `apps/services/package.json`. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `createMembership` is invoked with a `clerk_user_id` that has no matching row in `users`, the system shall log a warning that explicitly identifies the missing user (distinct from the missing-organization message) and return without inserting into `organization_members`. |
| EC002 | WHEN `createMembership` is invoked with a `clerk_org_id` that has no matching row in `organizations`, the system shall log a warning that explicitly identifies the missing organization (distinct from the missing-user message) and return without inserting into `organization_members`. |
| EC003 | WHEN `createMembership` is invoked with an existing `(user_id, org_id)` pair, the system shall complete without raising an error and shall not duplicate the row (preserving the current `ignoreDuplicates` semantics). |
| EC004 | WHEN `GET /users/me` is called for a `clerk_user_id` that has no row in `users`, the system shall return the same response (the null/empty-profile path) that the Supabase-backed implementation currently produces. Assumption: behavior is preserved by returning `null` from the repository, mirroring the existing code. |
| EC005 | WHEN the Postgres connection environment variable is absent at process start, the system shall throw a descriptive error during module initialization (mirroring the current Supabase URL/key validation) and prevent the Fastify server from listening. |
| EC006 | WHEN a database query fails at runtime (driver-level error, constraint violation, connection drop), the system shall surface the failure as a thrown error from the repository so the existing Fastify error handler returns the same HTTP status it would have returned for a Supabase failure. |

## Technical constraints

- Postgres client: `postgres.js` (tagged-template queries, per `apps/services/CLAUDE.md`).
- No ORM, query builder, or other SQL abstraction may be introduced.
- Repository interfaces (`IUserRepository`, the public surface of `ClerkSyncRepository`) and all consumers (use cases, handlers, routes, plugins) must remain unchanged; only the implementation behind the repositories may change.
- The new Postgres client must be exposed as a reusable singleton from `src/shared/infrastructure/` (replacing the role currently played by `supabase.ts`), keeping handler/plugin wiring patterns intact.
