# AUTH-003 — User Profile

## Reason for being

User identity data is already synchronized into the Supabase `users` table via the Clerk webhook (AUTH-002), but the product currently has no way for users to consult or edit their own profile data. There are no backend endpoints exposing the authenticated user's profile and no UI surface in `apps/web` rendering or mutating it.

This feature exposes an authenticated profile endpoint pair (`GET`/`PATCH /users/me`) in `apps/services` and a `/profile` page in `apps/web` so that users can view their identity attributes (name, email, avatar) and edit the preferences the product owns directly: `locale` and `timezone`.

## Scope

The requirements cover (1) a Supabase migration extending the `users` table with `locale` and `timezone` columns, (2) two authenticated REST endpoints in `apps/services` to read and partially update the current user's profile, and (3) a `/profile` page in `apps/web` that renders the profile and provides a form to edit the two editable preferences with explicit save feedback. The shared `UserProfile` type is published from `@repo/types`.

## Out of scope

- Editing of name, email, or avatar (these remain managed by Clerk's UI).
- Onboarding flow and segmentation fields (`job_role`, `company_size`, `primary_use_case`) — covered by AUTH-004.
- Organization profile page.
- Account deletion.
- Validation of `locale` and `timezone` values against canonical lists (e.g., BCP-47, IANA TZ database).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a Supabase migration that adds a nullable `locale` (text) column and a nullable `timezone` (text) column to the `users` table. |
| R002 | Ubiquitous | The system shall expose an authenticated endpoint `GET /users/me` in `apps/services` that is protected by the `requireAuth` preHandler. |
| R003 | Event-driven | WHEN an authenticated request hits `GET /users/me`, the system shall look up the user row in Supabase by the request's `clerk_user_id` and return a JSON payload containing `name`, `email`, `avatar_url`, `locale`, and `timezone`. |
| R004 | Ubiquitous | The system shall expose an authenticated endpoint `PATCH /users/me` in `apps/services` that is protected by the `requireAuth` preHandler. |
| R005 | Event-driven | WHEN an authenticated request hits `PATCH /users/me` with a valid body, the system shall update only the supplied `locale` and/or `timezone` fields on the matching user row in Supabase and respond with the updated profile payload. |
| R006 | Conditional | IF the `PATCH /users/me` body contains fields outside of `locale` and `timezone`, THEN the system shall reject the request via Zod validation with HTTP 400 and not mutate the user row. |
| R007 | Ubiquitous | The system shall expose a `/profile` page in `apps/web` that is rendered only for authenticated users (i.e., behind `AuthGuard`). |
| R008 | Event-driven | WHEN the `/profile` page mounts, the system shall fetch the current user's profile via `GET /users/me` using React Query and render `name`, `email`, `avatar`, `locale`, and `timezone`. |
| R009 | Ubiquitous | The system shall render a form on `/profile` that allows the user to edit `locale` and `timezone` and submit the changes through `PATCH /users/me` using a React Query mutation. |
| R010 | Event-driven | WHEN the profile form submission succeeds, the system shall display a visible save-success feedback indicator to the user and reflect the updated values on screen. |
| R011 | Event-driven | WHEN the profile form submission fails, the system shall display a visible save-error feedback indicator to the user and leave the previously rendered values unchanged. |
| R012 | Ubiquitous | The system shall publish a shared `UserProfile` interface from `@repo/types` consumed by both `apps/services` and `apps/web` for typing the profile payload. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | `GET /users/me` shall respond in under 200ms (server-side processing time, excluding network) under normal load. |
| NF002 | `PATCH /users/me` shall validate the request body with Zod, accepting only the fields `locale` and `timezone`. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a request to `GET /users/me` or `PATCH /users/me` arrives without a valid Clerk JWT, the system shall return HTTP 401 (enforced by `requireAuth`) and not query Supabase. |
| EC002 | WHEN an authenticated request hits `GET /users/me` but no row exists in `users` for the request's `clerk_user_id` (e.g., the Clerk webhook has not yet synced), the system shall return HTTP 404 with a domain error code. |
| EC003 | WHEN `PATCH /users/me` is called with an empty body `{}`, the system shall treat it as a no-op, leave the user row unchanged, and return HTTP 200 with the current profile. |
| EC004 | WHEN `PATCH /users/me` is called with `locale` or `timezone` explicitly set to `null`, the system shall persist `null` for those columns and return the updated profile. |
| EC005 | WHEN `PATCH /users/me` is called with `locale` or `timezone` set to a non-string type (e.g., number, boolean, object), the system shall reject the request via Zod validation with HTTP 400. |
| EC006 | WHEN the Supabase update in `PATCH /users/me` fails (DB error, connectivity loss), the system shall respond with HTTP 500 and the profile page shall surface the save-error feedback to the user without mutating the cached profile. |
| EC007 | WHEN the user has no `avatar_url` stored in Supabase (column is `null`), the `/profile` page shall render a fallback avatar placeholder instead of a broken image. |

## Technical constraints

- Backend uses Fastify with the `@supabase/supabase-js` client for database access.
- Frontend uses React Query for both the profile fetch and the profile mutation.
- The shared `UserProfile` interface lives in `@repo/types` and is consumed by both `apps/services` and `apps/web`.
- Both endpoints reuse the existing `requireAuth` preHandler from AUTH-001 and the existing `users` table from AUTH-002 — no new auth or sync primitives are introduced.
