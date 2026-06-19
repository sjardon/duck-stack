# AUTH-001 — Clerk Authentication Integration

## Reason for being

The apps `web` and `services` are currently scaffolded (INFRA-001, WEB-001, SERVICES-001) with the base structure in place, but neither has any authentication. `apps/web` exposes a `useSessionStore` placeholder and `api/client.ts` already supports an optional `Authorization: Bearer` header — both deliberately left empty to be populated by the auth feature. `apps/services` exposes only a public `GET /health` endpoint with no notion of an authenticated request.

This feature integrates Clerk as the end-to-end identity provider: the React frontend obtains and manages user sessions through Clerk's components and hooks, and the Fastify backend verifies JWTs locally to authenticate API requests. It also enables Clerk Organizations to support optional multi-tenancy at the request-context level.

## Scope

Configure Clerk in `apps/web` (provider, sign-in/sign-up pages, auth guard, user/org hooks, organization UI components, user button) and in `apps/services` (Fastify plugin to verify Clerk JWTs and decorate requests with `userId` and `orgId`, plus `requireAuth` and `requireOrg` preHandlers). Support email + password with OTP email verification and Google OAuth as the only sign-in methods. Organization context is read-only on the backend and never enforced at the starter level.

## Out of scope

- OAuth providers other than Google (GitHub, Microsoft, etc.)
- MFA/2FA, magic links, passkeys
- Custom Clerk roles (only the default `admin` and `member` roles are used)
- Custom user-profile editing UI (Clerk's built-in UI is used)
- Admin panel for managing users
- Forcing `orgId` to be non-null at the starter level — each downstream project decides whether to attach `requireOrg` to its routes
- Clerk integration inside `apps/landing` — `landing` only exposes redirect links to `/sign-in` and `/sign-up` on `web`

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall configure `ClerkProvider` in `apps/web/src/main.tsx` using the publishable key from the `VITE_CLERK_PUBLISHABLE_KEY` environment variable. |
| R002 | Event-driven | WHEN a user navigates to `/sign-in` the system shall render Clerk's `<SignIn />` component supporting email + password and Google OAuth. |
| R003 | Event-driven | WHEN a user navigates to `/sign-up` the system shall render Clerk's `<SignUp />` component supporting email + password (with email verification via OTP code) and Google OAuth. |
| R004 | Conditional | IF an unauthenticated user attempts to access a route wrapped by `AuthGuard`, THEN the system shall redirect to `/sign-in`. |
| R005 | Conditional | IF an authenticated user accesses a route wrapped by `AuthGuard`, THEN the system shall render the protected route's children. |
| R006 | Ubiquitous | The system shall expose a `useCurrentUser` hook in `apps/web` that wraps Clerk's `useUser` and returns the current user (or `null` when unauthenticated). |
| R007 | Ubiquitous | The system shall expose a `useCurrentOrg` hook in `apps/web` that wraps Clerk's `useOrganization` and returns the active organization (or `null` when none is active). |
| R008 | Event-driven | WHEN a user navigates to `/org/create` the system shall render Clerk's `<CreateOrganization />` component. |
| R009 | Ubiquitous | The system shall provide a route exposing Clerk's `<OrganizationProfile />` component so users can send and manage organization invitations through Clerk's built-in UI. |
| R010 | Ubiquitous | The system shall render Clerk's `<UserButton />` in the layout of the authenticated `apps/web` application. |
| R011 | Ubiquitous | The system shall register a Fastify plugin `clerk-auth.plugin.ts` in `apps/services` that reads the `Authorization: Bearer <token>` header and verifies the Clerk JWT locally using Clerk's public key. |
| R012 | Conditional | IF the `Authorization` header contains a valid Clerk JWT, THEN the system shall decorate the Fastify request with `userId: string` and `orgId: string \| null` derived from the token's claims. |
| R013 | Conditional | IF a request handled by the `requireAuth` preHandler has no `Authorization` header or an invalid/expired JWT, THEN the system shall respond with HTTP 401. |
| R014 | Conditional | IF a request handled by the `requireOrg` preHandler has `orgId === null`, THEN the system shall respond with HTTP 403. |
| R015 | Conditional | IF a request handled by the `requireOrg` preHandler has a non-null `orgId`, THEN the system shall pass the request through to the route handler. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The Fastify Clerk plugin shall verify every incoming JWT locally using Clerk's public key, without performing any network call to the Clerk API per request. |
| NF002 | The Fastify request context shall treat `orgId` as nullable; the starter shall not reject requests solely on the basis of a missing organization. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a user submits the sign-up form but does not complete email OTP verification, the system shall keep the session unauthenticated and continue showing Clerk's `<SignUp />` verification step until the OTP is confirmed. |
| EC002 | WHEN a request reaches `requireAuth` with a syntactically malformed `Authorization` header (e.g., missing `Bearer` prefix), the system shall respond with HTTP 401. |
| EC003 | WHEN a request reaches `requireAuth` with a JWT whose signature is valid but whose `exp` claim is in the past, the system shall respond with HTTP 401. |
| EC004 | WHEN an authenticated user signs out via `<UserButton />`, the system shall clear the Clerk session and the next access to an `AuthGuard`-wrapped route shall redirect to `/sign-in` (per R004). |
| EC005 | WHEN a user is authenticated but has not selected an active organization, `useCurrentOrg` shall return `null` and backend requests for that user shall arrive at `requireOrg`-protected routes with `orgId === null` (rejected per R014). |
| EC006 | WHEN `VITE_CLERK_PUBLISHABLE_KEY` is missing at `apps/web` build or runtime, the system shall fail fast at application startup with a clear error rather than rendering a partially configured `ClerkProvider`. (Assumption: conservative fail-fast — the feature provides no fallback unauthenticated mode.) |
| EC007 | WHEN `CLERK_SECRET_KEY` is missing at `apps/services` startup, the system shall fail fast during plugin registration rather than starting an API that accepts unauthenticated requests as valid. (Assumption: conservative fail-fast.) |
| EC008 | WHEN a route in `apps/services` is registered without `requireAuth` and receives an `Authorization` header, the system shall still decorate the request with `userId` and `orgId` if the JWT is valid, and shall leave them as their default uninitialized values if no JWT is present (no automatic 401). |

## Technical constraints

- Identity provider: Clerk.
- `apps/web` shall use `@clerk/clerk-react` for provider, components, and hooks.
- `apps/services` shall use `@clerk/fastify` or `@clerk/backend` for JWT verification.
- Environment variables: `VITE_CLERK_PUBLISHABLE_KEY` in `apps/web`, `CLERK_SECRET_KEY` in `apps/services`.
- Supported sign-in methods are limited to email + password (with OTP email verification) and Google OAuth.
- Clerk Organizations are used as the multi-tenancy primitive; only the default `admin` and `member` roles are exposed.
- `apps/landing` shall not embed Clerk components; it shall only link to the `/sign-in` and `/sign-up` routes of `apps/web`.
- Depends on WEB-001 (base `apps/web` structure) and SERVICES-001 (base `apps/services` structure) being in place.
