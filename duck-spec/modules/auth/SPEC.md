# auth — Module Specification

Living functional specification of the auth module. Describes current behavior, not planned behavior.

---

## Identity provider

Clerk is the end-to-end identity provider for duck-stack. `apps/web` uses `@clerk/clerk-react`; `apps/services` uses `@clerk/backend`. No other identity provider or authentication library is used.

Supported sign-in methods: email + password with OTP email verification, and Google OAuth.

## Frontend — `apps/web`

`ClerkProvider` wraps the entire React tree in `main.tsx`. The publishable key is read from `VITE_CLERK_PUBLISHABLE_KEY`; the application throws before rendering if the variable is absent.

React Router handles all routing. The route table includes:

| Path | Component | Guard |
|------|-----------|-------|
| `/sign-in` | `SignInPage` (`<SignIn />`) | public |
| `/sign-up` | `SignUpPage` (`<SignUp />`) | public |
| `/org/create` | `CreateOrgPage` (`<CreateOrganization />`) | `AuthGuard` |
| `/org/profile` | `OrgProfilePage` (`<OrganizationProfile />`) | `AuthGuard` |
| `/profile` | `ProfilePage` | `AuthGuard` |
| `/*` (layout) | `AppLayout` + nested routes | `AuthGuard` |

`AuthGuard` reads `useAuth().isSignedIn` from Clerk. While Clerk is loading it renders a loading state. When `isSignedIn` is false it redirects to `/sign-in`. When true it renders `<Outlet />`.

`useCurrentUser` (in `hooks/use-current-user.ts`) wraps Clerk's `useUser` and returns `UserResource | null`. `useCurrentOrg` (in `hooks/use-current-org.ts`) wraps `useOrganization` and returns `OrganizationResource | null`. Both return `null` when the resource is not loaded or not present, including when no organization is active.

`AppLayout` renders `<UserButton />` from `@clerk/clerk-react` in the header for in-place sign-out and account management.

`useSessionStore` holds `{ userId: string | null; token: () => Promise<string | null> }`. The `token` field wraps Clerk's `getToken()` so `api/client.ts` can attach a fresh JWT to API requests without any direct Clerk dependency outside the store.

## Backend — `apps/services`

`clerk-auth.plugin.ts` is a global Fastify plugin (registered via `fastify-plugin`) that runs an `onRequest` hook on every route. The plugin reads `CLERK_SECRET_KEY` from `process.env` at registration time and throws if the variable is absent. It obtains a Clerk client via `createClerkClient({ secretKey })` from `@clerk/backend`, which fetches and caches Clerk's JWKS key set once — no Clerk API call occurs per request (NF001).

The `onRequest` hook extracts the `Authorization: Bearer <token>` header. When the header is absent the request decorations are left undefined and no 401 is issued. When a token is present and valid, `request.userId` is set to the JWT's `sub` claim and `request.orgId` is set to `org_id ?? null`. When verification fails (expired, invalid signature, malformed header) `request.userId` is left undefined.

`FastifyRequest` is augmented (in `src/types/fastify.d.ts`) with:

| Property | Type | Meaning |
|----------|------|---------|
| `userId` | `string \| undefined` | Present and set when a valid JWT was verified |
| `orgId` | `string \| null \| undefined` | `string` when an org claim exists, `null` when authenticated without org, `undefined` when no valid JWT |

Two preHandler functions guard routes:

| PreHandler | Throws | Condition |
|------------|--------|-----------|
| `requireAuth` | `UnauthorizedError` (401) | `request.userId` is `undefined` |
| `requireOrg` | `ForbiddenError` (403) | `request.orgId` is `null` (calls `requireAuth` first) |

`ForbiddenError` extends `DomainError` with `statusCode: 403` and code `FORBIDDEN`. Neither `requireAuth` nor `requireOrg` is registered globally — each route that requires protection attaches the relevant preHandler explicitly.

## Organization (multi-tenancy)

Clerk Organizations serve as the multi-tenancy primitive. The starter exposes `orgId` on every verified request but does not enforce its presence globally. Downstream projects opt in to organization-scoped routes by attaching `requireOrg` to specific routes. Only the default Clerk roles `admin` and `member` are used; no custom roles are defined at the starter level.

`apps/landing` does not embed any Clerk components. It links to `/sign-in` and `/sign-up` on `apps/web` only.

## User profile endpoints

`apps/services` exposes two authenticated REST endpoints in `src/modules/users/`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/users/me` | `requireAuth` | Returns the authenticated user's profile: `name`, `email`, `avatar_url`, `locale`, `timezone`. Returns HTTP 404 (`NOT_FOUND`) when no `users` row matches the request's `clerk_user_id`. |
| `PATCH` | `/users/me` | `requireAuth` | Accepts a strict body containing only `locale` and/or `timezone` (both nullable strings). Updates the matching row and returns the updated profile. An empty body is a no-op returning the current profile with HTTP 200. Unknown fields are rejected with HTTP 400 via Zod `.strict()` validation. |

Both endpoints return `{ data: UserProfile }` on success. `UserProfile` is the shared interface exported from `@repo/types`, consumed by both `apps/services` and `apps/web`.

The `users` module follows the same hexagonal slice pattern as other feature modules: route plugin → handler → use-case → repository interface (`IUserRepository`) + Supabase implementation (`UserDBRepository`). The repository performs a single indexed lookup on `clerk_user_id` (unique column) with no joins, satisfying the sub-200 ms response time target.

## Profile page — `apps/web`

`pages/profile/ProfilePage.tsx` is rendered at `/profile` behind `AuthGuard`. On mount it fetches the current user's profile via `useUserProfile()`, a React Query `useQuery` hook backed by `api/users.ts → fetchUserProfile`. The page renders `name`, `email`, avatar (with a fallback placeholder when `avatar_url` is `null`), `locale`, and `timezone`.

A controlled form allows the user to edit `locale` and `timezone`. Submission dispatches `useUpdateProfile()`, a React Query `useMutation` backed by `patchUserProfile`. On success the cache is invalidated and a visible success indicator is shown. On error a visible error indicator is shown without mutating the displayed values.

## Supabase schema

Three tables constitute the identity persistence layer in Supabase:

| Table | Primary key | Unique constraints | Purpose |
|-------|-------------|-------------------|---------|
| `users` | `id` (uuid) | `clerk_user_id` | Local mirror of Clerk user records |
| `organizations` | `id` (uuid) | `clerk_org_id`, `slug` | Local mirror of Clerk organization records |
| `organization_members` | `(user_id, org_id)` composite | — | Membership join table with `role` |

The `users` table additionally carries `locale` (TEXT, nullable) and `timezone` (TEXT, nullable) columns added by migration `20260622000000_users_locale_timezone.sql`. Both columns default to `null`; they are the product-owned preferences editable via the profile endpoints.

`updated_at` on `users` and `organizations` is maintained automatically by a database trigger. `organization_members` has no `updated_at` column.

Migrations are managed with the Supabase CLI under `apps/services/supabase/migrations/`. A seed file at `apps/services/supabase/seed.sql` provides idempotent example rows for local development.

## Clerk webhook sync

`apps/services` exposes `POST /webhooks/clerk`, a Fastify plugin registered under `src/modules/webhooks/clerk/`. This endpoint keeps the Supabase identity tables synchronized with Clerk's source of truth in near real time.

The endpoint receives the request body as a raw `Buffer` via a scoped `addContentTypeParser` override. This is required so that `verifyWebhook` from `@clerk/backend/webhooks` can verify the Svix HMAC signature against the unmodified bytes. If the `svix-id`, `svix-timestamp`, or `svix-signature` headers are missing or the signature is invalid, the endpoint responds with HTTP 400. Successful processing returns HTTP 200.

`CLERK_WEBHOOK_SIGNING_SECRET` is read at plugin registration time; the server throws immediately if the variable is absent, ensuring the endpoint is never served without signature verification.

Event dispatching is handled by a `dispatchClerkEvent` function that maps event type strings to handler functions:

| Event type | Handler | Effect |
|---|---|---|
| `user.created` | `handleUserUpsert` | Upserts a row in `users` keyed by `clerk_user_id` |
| `user.updated` | `handleUserUpsert` | Upserts `email`, `name`, `avatar_url` for the matching `users` row |
| `organization.created` | `handleOrganizationUpsert` | Upserts a row in `organizations` keyed by `clerk_org_id` |
| `organizationMembership.created` | `handleMembershipCreate` | Inserts a row in `organization_members` (no-op if parent user or org is not yet present) |
| (unrecognised) | — | Returns HTTP 200 without modifying any table |

All database operations are centralized in `ClerkSyncRepository`. Upserts use `ON CONFLICT ... DO UPDATE` semantics so that out-of-order or replayed events are idempotent. `createMembership` resolves local UUIDs from `clerk_user_id` and `clerk_org_id` before inserting; if either lookup finds no row, it logs a warning and skips the insert without raising a foreign-key error.

The webhook plugin is registered in `app.ts` before `clerkAuthPlugin` so the global `onRequest` auth hook does not interfere with the intentionally unauthenticated webhook route.
