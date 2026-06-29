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

Individual endpoint modules call `apiFetch` and are in turn consumed only by hooks — never by components or pages directly. Domain modules that require an auth token pass it explicitly as the first argument (e.g. `createCheckout(token, body)`). `api/billing.ts` exports `createCheckout`, `getTransaction`, and `listTransactions`, each accepting a bearer token and returning typed responses using `@repo/types` (`Transaction`, `TransactionListResponse`).

## `apps/web` — Auth conventions

`ClerkProvider` is placed outside `QueryClientProvider` in `main.tsx` so Clerk state is available to all hooks and query functions. The publishable key is read from `VITE_CLERK_PUBLISHABLE_KEY`; the application throws before rendering if the variable is absent.

### AuthGuard

`components/auth/AuthGuard.tsx` is a layout route component used in the router to gate protected sections. It enforces two sequential conditions before rendering `<Outlet />`:

1. **Authentication** — reads `useAuth().isSignedIn` from `@clerk/clerk-react`. While Clerk is initialising it renders a loading state. When `isSignedIn` is false it navigates to `/sign-in` with `replace`.
2. **Onboarding completion** — calls `useUserProfile()` to read `onboarding_completed`. While the profile is loading or has errored it holds in a neutral loading state without redirecting. Once loaded, if `onboarding_completed` is `false` and the current path is not `/onboarding` it renders `<Navigate to="/onboarding" replace />` before any protected page is mounted (satisfying the pre-render redirect requirement). If `onboarding_completed` is `true` and the current path is `/onboarding` it redirects to `/` instead.

Individual page components must not duplicate the onboarding gating check — that logic lives exclusively in `AuthGuard`.

### Auth-related hooks

| Export | File | Returns |
|--------|------|---------|
| `useCurrentUser` | `hooks/use-current-user.ts` | `UserResource \| null` — wraps Clerk's `useUser` |
| `useCurrentOrg` | `hooks/use-current-org.ts` | `OrganizationResource \| null` — wraps Clerk's `useOrganization` |
| `useUserProfile` | `hooks/use-user-profile.ts` | React Query `useQuery` result for `UserProfile`; key `['users', 'me']` |
| `useUpdateProfile` | `hooks/use-user-profile.ts` | React Query `useMutation` for `PATCH /users/me`; invalidates `['users', 'me']` on success |
| `useCompleteOnboarding` | `hooks/use-user-profile.ts` | React Query `useMutation` for `POST /users/me/onboarding`; invalidates `['users', 'me']` on success |

`useCurrentUser` and `useCurrentOrg` return `null` when the resource is not loaded or not present. Components that need the current user or active organization import these hooks rather than calling Clerk hooks directly. `useUserProfile`, `useUpdateProfile`, and `useCompleteOnboarding` all share the `['users', 'me']` query key — mutations invalidate it so the profile is refetched automatically after any change. They call `api/users.ts` which uses `apiFetch` with a bearer token from `useAuth().getToken()`.

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

### Onboarding page

| Route | Component | Description |
|-------|-----------|-------------|
| `/onboarding` | `pages/onboarding/OnboardingPage.tsx` | First-access segmentation form for new users |

The page is wrapped by `AuthGuard`. It renders a welcome message and a form with three inputs (`job_role`, `company_size`, `primary_use_case`) plus a submit button. Submission fires `useCompleteOnboarding`; on success the page navigates to `/`. `AuthGuard` prevents users who have already completed onboarding from reaching this page. This page is the only path through which `onboarding_completed` transitions from `false` to `true` in the frontend flow.

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

## Entitlement gating

`apps/web` provides two primitives for feature gating based on the authenticated scope's subscription entitlements.

### `useEntitlement(name: EntitlementName): boolean`

Defined in `apps/web/src/hooks/use-entitlement.ts`. Fetches `GET /billing/entitlements/me` via React Query with query key `['billing', 'entitlements', 'me']` and a `staleTime` of 5 minutes. All components that call `useEntitlement` share this single cache entry — no additional network requests are made regardless of how many components on the page consume it. A 401 response is caught inside the query function and returns an empty array without propagating an error, making the hook safe to call before auth settles. Returns `true` if the response array includes `name`, `false` otherwise.

### `<EntitlementGate name="..." fallback={...}>`

Defined in `apps/web/src/components/domain/billing/EntitlementGate.tsx`. Renders `children` when `useEntitlement(name)` is `true`; renders `fallback` (defaulting to an inline upgrade CTA) when `false`. Consumers supply a typed `EntitlementName` (from `@repo/types`) as the `name` prop. The component does not manage loading state — during the initial query window it treats the entitlement as absent, so the upgrade CTA is shown briefly until the response arrives. If this flicker is unacceptable for a given use case, consumers should guard with a loading check before rendering `<EntitlementGate>`.

## Quota gating

`apps/web` provides three primitives for rendering UI based on the authenticated scope's numeric quota usage. All three are colocated in the billing domain.

### `useQuota(name: QuotaName)`

Defined in `apps/web/src/hooks/useQuota.ts`. Fetches `GET /billing/quotas/me` via React Query with query key `['billing', 'quotas', 'me']`, `staleTime: 60_000` (60 s), and `refetchOnWindowFocus: true`. All components that call `useQuota` share this single cache entry — at most one network request is issued per stale window regardless of how many hook instances are mounted. The hook filters the response array to the entry whose `name` matches the argument and returns:

| Field | Type | Value when loading or entry absent |
|---|---|---|
| `count` | `number` | `0` |
| `soft_limit` | `number` | `Infinity` |
| `hard_limit` | `number` | `Infinity` |
| `state` | `QuotaState` | `'normal'` |
| `period_end` | `string` | `''` |
| `isLoading` | `boolean` | `true` |

When `isLoading` is `true` or the named quota is not defined on the scope's plan, `state` is `'normal'` so the component tree is not blocked during first load. `QuotaName`, `QuotaUsage`, and `QuotaState` are imported from `@repo/types`; the frontend does not redeclare them.

### `useInvalidateQuotas()`

Also exported from `apps/web/src/hooks/useQuota.ts`. Returns a function that calls `queryClient.invalidateQueries({ queryKey: ['billing', 'quotas', 'me'] })`. Consumers call it after a mutation that the backend counts against a quota to immediately refresh cached usage data rather than waiting for `staleTime` to expire or the window to regain focus.

### `<QuotaGate name="..." fallbackBlocked={...} fallbackWarning={...}>`

Defined in `apps/web/src/components/domain/billing/QuotaGate.tsx`. Calls `useQuota(name)` internally — no quota data needs to be wired from the page. Selects a rendering branch with `hard_exceeded` taking unconditional precedence:

| `state` | Rendered output |
|---|---|
| `hard_exceeded` | `fallbackBlocked` prop, or default blocked message with upgrade CTA when applicable |
| `soft_exceeded` | `children` plus `fallbackWarning` prop, or `children` plus default warning banner with upgrade CTA when applicable |
| `normal` (including while loading) | `children` only |

The upgrade CTA is resolved by composing `usePlans()` and `useMySubscription()`. The next plan is the first entry in the catalog (sorted by `price` ascending) with `price > currentPlan.price`. When the user is already on the highest-priced plan, or the user's plan has been removed from the catalog with no higher-priced successor, the CTA is replaced with "You are on our highest plan — contact us for custom limits". No CTA is rendered when `state` is `'normal'`. The domain-component-calls-hook pattern is an established convention in the billing domain (also used by `<EntitlementGate>`) and is an intentional exception to the strict unidirectional import rule.

## Shared domain types

Frontend apps import shared TypeScript interfaces from `@repo/types` via the pnpm workspace link. `components/ui/` components must not import from `@repo/types` — domain awareness is reserved for `components/domain/` and above.
