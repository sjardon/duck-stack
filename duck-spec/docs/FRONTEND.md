# Frontend

Living document describing frontend conventions, components, and design system decisions for duck-stack.

---

## Stack

| Concern | Choice |
|---------|--------|
| Bundler | Vite |
| UI library | React |
| Language | TypeScript (strict mode via `@repo/tsconfig`) |
| Module resolution | `Bundler` (inherited from `@repo/tsconfig/base.json`) |
| Lint | ESLint via `@repo/eslint-config` |
| Routing | React Router DOM — `createBrowserRouter` in `apps/web/src/router.tsx` |
| Server-state | React Query (`@tanstack/react-query`) — configured in `main.tsx` via `QueryClientProvider` |
| Client-state | Zustand — two stores (`useSessionStore`, `useUiStore`) in `apps/web/src/store/` |
| Auth | Clerk via `@clerk/clerk-react` — `ClerkProvider` wraps the React tree in `main.tsx` |

## Applications

| App | Purpose |
|-----|---------|
| `apps/web` | Main SPA for authenticated users |
| `apps/landing` | Public marketing / landing pages SPA |

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `vite` |
| `build` | `vite build` |
| `lint` | `eslint src` |

## `apps/web` — Layered architecture

`apps/web/src` is divided into layer directories with a strict unidirectional import rule:

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| HTTP client | `api/` | Raw API calls via `apiFetch`; no React dependencies |
| Data hooks | `hooks/` | React Query wrappers; consume `api/` and expose query state to pages |
| Pages | `pages/` | Route-level components; the only place data-fetching hooks are called |
| Domain components | `components/domain/` | Domain-aware presentational components; receive all data via props from pages |
| UI components | `components/ui/` | Reusable, domain-agnostic presentational components; must not import from `@repo/types` |
| Stores | `store/` | Zustand stores for client-side state |
| Helpers | `lib/` | Generic utility functions with no React dependencies |

Import direction is enforced by convention: `api` → `hooks` → `pages` → `components`. No layer may import from a layer above it.

## `api/client.ts` pattern

All HTTP calls from `apps/web` go through `apiFetch<T>(path, options?)` in `api/client.ts`. The function resolves the base URL from `VITE_API_URL` and attaches an `Authorization: Bearer` header when `options.token` is supplied. When no token is present the header is omitted rather than throwing, so the client is usable before auth is implemented. Non-2xx responses throw a typed `ApiError` (message + status).

Individual endpoint modules (e.g. `api/health.ts`) call `apiFetch` and are in turn consumed only by hooks — never by components or pages directly.

## `apps/web` — Auth conventions

`ClerkProvider` is placed outside `QueryClientProvider` in `main.tsx` so Clerk state is available to all hooks and query functions. The publishable key is read from `VITE_CLERK_PUBLISHABLE_KEY`; the application throws before rendering if the variable is absent.

### AuthGuard

`components/auth/AuthGuard.tsx` is a layout route component used in the router to gate protected sections. It reads `useAuth().isSignedIn` from `@clerk/clerk-react`. While Clerk is initialising it renders a loading state. When `isSignedIn` is false it navigates to `/sign-in` with `replace`. When true it renders `<Outlet />`.

### Auth-related hooks

| Export | File | Returns |
|--------|------|---------|
| `useCurrentUser` | `hooks/use-current-user.ts` | `UserResource \| null` — wraps Clerk's `useUser` |
| `useCurrentOrg` | `hooks/use-current-org.ts` | `OrganizationResource \| null` — wraps Clerk's `useOrganization` |
| `useUserProfile` | `hooks/use-user-profile.ts` | React Query `useQuery` result for `UserProfile`; key `['users', 'me']` |
| `useUpdateProfile` | `hooks/use-user-profile.ts` | React Query `useMutation` for `PATCH /users/me`; invalidates `['users', 'me']` on success |

`useCurrentUser` and `useCurrentOrg` return `null` when the resource is not loaded or not present. Components that need the current user or active organization import these hooks rather than calling Clerk hooks directly. `useUserProfile` and `useUpdateProfile` back the `/profile` page; they call `api/users.ts` which uses `apiFetch` with a bearer token from `useAuth().getToken()`.

### Organization pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/org/create` | `pages/org/CreateOrgPage.tsx` | Renders Clerk's `<CreateOrganization />` |
| `/org/profile` | `pages/org/OrgProfilePage.tsx` | Renders Clerk's `<OrganizationProfile />` (including invitation management) |

Both routes are wrapped by `AuthGuard`.

### Profile page

| Route | Component | Description |
|-------|-----------|-------------|
| `/profile` | `pages/profile/ProfilePage.tsx` | Renders the authenticated user's profile and a form to edit `locale` and `timezone` |

The page is wrapped by `AuthGuard`. It fetches data via `useUserProfile` on mount and submits changes via `useUpdateProfile`. Success and error states are surfaced as visible feedback without leaving the page. When `avatar_url` is `null`, a fallback avatar placeholder is rendered instead of a broken image.

### AppLayout

`components/layout/AppLayout.tsx` is the authenticated layout shell. It renders `<UserButton />` from `@clerk/clerk-react` in the header, providing in-place sign-out and account management for every authenticated page.

## Store structure

| Store | Export | Purpose |
|-------|--------|---------|
| `store/session.store.ts` | `useSessionStore` | User session state: `userId: string \| null` and `token: () => Promise<string \| null>`. `token` wraps Clerk's `getToken()` so `api/client.ts` can attach a fresh JWT without importing Clerk directly. |
| `store/ui.store.ts` | `useUiStore` | Global UI state — extended as UI features are added |

Both stores are created with Zustand and export a single hook. Their interfaces are extended in-place by each feature that owns new state.

## `lib/` helpers

`lib/formatters.ts` exports `formatDate` and `formatCurrency`. `lib/utils.ts` exports generic helpers. Neither module imports React; they are safe to use in any layer including `api/`.

## `apps/landing` — Marketing SPA structure

`apps/landing` uses a flat layer model adapted from the `apps/web` approach but without data-fetching or state management concerns. Folders map directly to responsibility:

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| Layout chrome | `components/layout/` | Structural components (`Navbar`, `Footer`) rendered on every page; stateless, no props |
| Marketing sections | `components/sections/` | Independent, composable marketing blocks; stateless, no cross-section imports |
| UI primitives | `components/ui/` | Domain-agnostic components (`Button`, `Badge`); must not import beyond React |
| Pages | `pages/` | Route-level composition; imports only from `components/layout/` and `components/sections/` |
| API stubs | `api/` | Network modules; stubs resolve locally until a real backend endpoint exists |
| Helpers | `lib/` | React-free generic utilities |

Section components in `components/sections/` must remain independent of each other — no cross-section imports are permitted. Order of composition is determined solely by the page component. `components/ui/` components must not import any library other than React.

`apps/landing` deliberately omits React Query, Zustand, and `@repo/types`. These are intentional exclusions that match the lightweight nature of a marketing SPA and must not be introduced without a new feature explicitly scoping that addition.

## Shared domain types

Frontend apps import shared TypeScript interfaces from `@repo/types` via the pnpm workspace link. `components/ui/` components must not import from `@repo/types` — domain awareness is reserved for `components/domain/` and above.
