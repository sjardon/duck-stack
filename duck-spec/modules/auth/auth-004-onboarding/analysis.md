# AUTH-004 — Onboarding

## Reason for being

Newly registered users currently land directly on the authenticated dashboard right after signing up through Clerk (AUTH-001) and the webhook sync (AUTH-002). The `users` table now exposes basic profile fields (AUTH-003), but the product captures no segmentation information about the people who sign up. There is no way to know what role, company size, or primary use case a new user represents, which blocks downstream personalisation, analytics, and lifecycle messaging.

This feature introduces a mandatory onboarding step that intercepts the first authenticated access, captures `job_role`, `company_size`, and `primary_use_case`, and gates every protected route until the user has completed it.

## Scope

The requirements cover (1) a Supabase migration that extends the `users` table with the three segmentation fields plus an `onboarding_completed` boolean flag, (2) a single authenticated `POST /users/me/onboarding` endpoint in `apps/services` that persists all four fields atomically, (3) an extension of the existing `AuthGuard` in `apps/web` that redirects between `/onboarding` and the dashboard based on the `onboarding_completed` flag, and (4) an `/onboarding` page that renders the segmentation form and redirects to the dashboard upon successful submission.

## Out of scope

- Multi-step wizard or progressive onboarding flow.
- Onboarding resources, tutorials, or product-specific content.
- Editing the onboarding fields afterwards from `/profile`.
- Re-triggering or resetting the onboarding flow for a user that already completed it.
- Validation of `job_role`, `company_size`, or `primary_use_case` values against canonical enumerations.
- Server-side enforcement of `onboarding_completed` on routes other than `POST /users/me/onboarding` (the gate is performed by `AuthGuard` in the frontend).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a Supabase migration that adds nullable `job_role` (text), `company_size` (text), and `primary_use_case` (text) columns and a non-null `onboarding_completed` (boolean, default `false`) column to the `users` table. |
| R002 | Ubiquitous | The system shall expose an authenticated endpoint `POST /users/me/onboarding` in `apps/services` protected by the `requireAuth` preHandler. |
| R003 | Event-driven | WHEN an authenticated request hits `POST /users/me/onboarding` with a valid body containing `job_role`, `company_size`, and `primary_use_case`, the system shall persist all three values on the matching `users` row keyed by `clerk_user_id` and set `onboarding_completed = true` in a single database operation. |
| R004 | Event-driven | WHEN `POST /users/me/onboarding` completes the persistence successfully, the system shall respond with HTTP 200 and the updated profile payload reflecting `onboarding_completed = true`. |
| R005 | Ubiquitous | The system shall extend `GET /users/me` so that its response includes the `onboarding_completed` flag alongside the existing profile fields. |
| R006 | Ubiquitous | The system shall expose a route `/onboarding` in `apps/web` rendered only for authenticated users (i.e., behind `AuthGuard`). |
| R007 | Conditional | IF an authenticated user has `onboarding_completed = false` and requests any protected route other than `/onboarding`, THEN the system shall redirect to `/onboarding` before rendering the requested page. |
| R008 | Conditional | IF an authenticated user has `onboarding_completed = true` and requests `/onboarding`, THEN the system shall redirect to the dashboard before rendering the onboarding page. |
| R009 | Event-driven | WHEN the `/onboarding` page renders, the system shall display a welcome message and a form with the three fields `job_role`, `company_size`, and `primary_use_case` plus a submit button. |
| R010 | Event-driven | WHEN the user submits the onboarding form, the system shall call `POST /users/me/onboarding` via a React Query mutation that invalidates the `['users', 'me']` query on success. |
| R011 | Event-driven | WHEN the onboarding submission succeeds, the system shall redirect the user to the dashboard. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | `POST /users/me/onboarding` shall validate the request body with Zod, requiring `job_role`, `company_size`, and `primary_use_case` to all be present as non-empty strings. |
| NF002 | The onboarding redirect performed by `AuthGuard` shall occur before any protected page component is rendered, so the user never observes the dashboard before the onboarding screen. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a request to `POST /users/me/onboarding` arrives without a valid Clerk JWT, the system shall return HTTP 401 (enforced by `requireAuth`) and not query the database. |
| EC002 | WHEN `POST /users/me/onboarding` is called with a body missing any of `job_role`, `company_size`, or `primary_use_case`, the system shall reject the request via Zod validation with HTTP 400 and not mutate the user row. |
| EC003 | WHEN `POST /users/me/onboarding` is called with any of `job_role`, `company_size`, or `primary_use_case` set to an empty string or non-string value, the system shall reject the request via Zod validation with HTTP 400 and not mutate the user row. |
| EC004 | WHEN an authenticated request hits `POST /users/me/onboarding` but no row exists in `users` for the request's `clerk_user_id`, the system shall return HTTP 404 with the `NOT_FOUND` domain error code and not create a new row. |
| EC005 | WHEN `POST /users/me/onboarding` is called and the underlying database update fails (DB error, connectivity loss), the system shall respond with HTTP 500 and `onboarding_completed` shall remain `false`. |
| EC006 | WHEN `POST /users/me/onboarding` is invoked on a user that already has `onboarding_completed = true`, the system shall overwrite the three fields with the new values, leave `onboarding_completed = true`, and respond with HTTP 200 (the endpoint is idempotent at the persistence layer). |
| EC007 | WHILE `useUserProfile` is still loading (initial fetch in flight), the system shall keep `AuthGuard` in its loading state and not redirect to `/onboarding` or render the protected page. |
| EC008 | WHEN `useUserProfile` fails to load (network or 5xx error) for an authenticated user, the system shall keep the user on a neutral loading or error state in `AuthGuard` and shall not redirect to `/onboarding` based on stale or absent data. |
| EC009 | WHEN an unauthenticated user requests `/onboarding`, the system shall redirect to `/sign-in` (enforced by the existing `AuthGuard` auth check) before evaluating the onboarding flag. |

## Technical constraints

- Backend uses Fastify with the `postgres.js` singleton database client (per BACKEND.md); `apps/services` does not depend on `@supabase/supabase-js` at runtime. The FEATURES.md reference to "Supabase client" is interpreted as the project's database client, currently `postgres.js`.
- The `users` module follows the existing hexagonal slice pattern (route plugin → handler → use-case → repository interface + database implementation) introduced in AUTH-003; no new auth or sync primitives are introduced.
- Frontend uses React Query for the onboarding mutation and reuses the existing `useUserProfile` query for reading `onboarding_completed`.
- The redirect logic lives in `AuthGuard` (`components/auth/AuthGuard.tsx`) — individual pages must not duplicate the gating check.
- `onboarding_completed` is exposed on the existing `GET /users/me` response and the shared `UserProfile` interface in `@repo/types` is extended accordingly so a single fetch covers both profile and onboarding state.
