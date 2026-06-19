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
