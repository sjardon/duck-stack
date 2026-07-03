# SUBS-009 — Trial UI Gates (frontend)

## Reason for being

SUBS-008 introduced the free trial mode on the backend: a `trialing` subscription is created at signup, `GET /billing/subscriptions/me` exposes `trial_ends_at` and `days_remaining`, and `requireActiveSubscription` blocks protected routes with HTTP 403 `TRIAL_EXPIRED` once the trial elapses. The `apps/web` SPA currently has no primitive that surfaces this state to the authenticated user, so the trial countdown is invisible and an expired-trial user hitting a protected page only sees an opaque 403 error.

This feature closes that gap by exposing the trial state through a shared React Query hook, rendering a top-of-app urgency banner during the last three days of the trial, forcing a plan-selection experience when the trial has expired, and installing an HTTP interceptor that redirects to that experience whenever the backend returns `TRIAL_EXPIRED`.

## Scope

Introduces a `useTrialStatus()` hook that consumes `GET /billing/subscriptions/me` under a query key shared with `useMySubscription` (SUBS-004), a `<TrialBanner />` component mounted inside `AuthenticatedLayout` that renders only during the last three trial days, a `/trial-expired` page that lists available plans (reusing `<PlanCard />` from SUBS-004) and offers a "Continue with free" action when the free plan exists in the catalog, an extension to `AuthGuard` that redirects expired-trial users to `/trial-expired` while whitelisting the routes needed to pick a plan, and an interceptor in `api/client.ts` that redirects to `/trial-expired` whenever any endpoint returns HTTP 403 with code `TRIAL_EXPIRED`.

## Out of scope

- Backend enforcement of trial expiry (owned by SUBS-008).
- Making the banner customizable by consumer (color, copy, position).
- Real-time countdown down to seconds; the banner deals in whole days rounded down.
- A trial welcome modal, trial onboarding tour, or premium-feature discovery tour.
- Cancellation survey or feedback capture when the trial expires.
- A banner variant for `daysRemaining > 3` (intentionally absent to preserve an "exploratory" phase without pressure).
- Real-time in-app notification of subscription state changes via websockets or SSE.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN `useTrialStatus()` mounts in a component, the system shall fetch `GET /billing/subscriptions/me` through React Query under the same query key used by `useMySubscription` so both hooks share a single cache entry. |
| R002 | Ubiquitous | The system shall expose the shape `{ isTrialing: boolean, daysRemaining: number \| null, trialEndsAt: string \| null, isExpired: boolean }` as the return value of `useTrialStatus()`. |
| R003 | Conditional | IF the fetched subscription has `status === 'trialing'`, THEN the system shall return `isTrialing = true`, `daysRemaining` set to `days_remaining` from the response, and `trialEndsAt` set to `trial_ends_at`. |
| R004 | Conditional | IF the fetched subscription has `status === 'expired'` and no other non-terminal subscription exists for the scope, THEN the system shall return `isExpired = true` from `useTrialStatus()`. |
| R005 | Conditional | IF the fetched subscription has a non-terminal `status` other than `trialing` or `expired` (e.g. `active`, `pending`, `past_due`), THEN the system shall return `isTrialing = false` and `isExpired = false`. |
| R006 | Event-driven | WHEN `<TrialBanner />` is rendered inside `AuthenticatedLayout` and `useTrialStatus()` returns `isTrialing === true && daysRemaining <= 3`, the system shall render a top bar with the text "X days left in your trial — upgrade now" and a CTA linking to `/pricing`. |
| R007 | Conditional | IF `useTrialStatus()` returns `isTrialing === false` or `daysRemaining > 3` or `daysRemaining` is `null`, THEN the system shall render nothing in place of `<TrialBanner />`. |
| R008 | Conditional | IF `useTrialStatus()` returns `daysRemaining === 0` while `isTrialing === true`, THEN the system shall render "Less than 1 day left in your trial — upgrade now" as the banner label. |
| R009 | Event-driven | WHEN the user navigates to `/trial-expired`, the system shall render the title "Your free trial has ended" and the list of plans returned by `GET /billing/plans` using the existing `<PlanCard />` component from SUBS-004. |
| R010 | Conditional | IF the plan catalog returned by `GET /billing/plans` contains a plan with `code === 'free'`, THEN the system shall render a "Continue with free" button on `/trial-expired` that dispatches `POST /billing/subscriptions` with `planCode = 'free'` and, on success, redirects the user to the dashboard (`/`). |
| R011 | Conditional | IF the plan catalog returned by `GET /billing/plans` does not contain a plan with `code === 'free'`, THEN the system shall omit the "Continue with free" button and render only the paid plans on `/trial-expired`. |
| R012 | Conditional | IF `useTrialStatus()` returns `isExpired === true` while the user is on a protected route other than `/pricing`, `/billing`, `/billing/subscribe`, or `/trial-expired`, THEN `AuthGuard` shall redirect the user to `/trial-expired`. |
| R013 | Conditional | IF `useTrialStatus()` returns `isExpired === true` and the current path is `/pricing`, `/billing`, `/billing/subscribe`, or `/trial-expired`, THEN `AuthGuard` shall render `<Outlet />` without redirecting. |
| R014 | Event-driven | WHEN any HTTP response processed by `api/client.ts` returns status `403` with error code `TRIAL_EXPIRED`, the system shall redirect the browser to `/trial-expired`. |
| R015 | Event-driven | WHEN the "Continue with free" mutation on `/trial-expired` succeeds, the system shall invalidate the shared `getMySubscription` query so `useTrialStatus()` re-derives `isExpired = false` before the redirect to `/`. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The React Query configuration used by `useTrialStatus()` shall use `staleTime` of 60 seconds and `refetchOnWindowFocus: true` so trial state converges when the user returns to the tab. |
| NF002 | All instances of `useTrialStatus()` and `useMySubscription()` mounted in the same session shall share a single React Query cache entry for `GET /billing/subscriptions/me`, issuing at most one network request per `staleTime` window. |
| NF003 | Rendering `<TrialBanner />` shall not cause a layout shift when the banner appears or disappears; the layout shall reserve vertical space in CSS or use a fixed/sticky positioning strategy that does not reflow the page body. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `useTrialStatus()` is consumed before the initial `GET /billing/subscriptions/me` response resolves, the system shall return `isTrialing = false` and `isExpired = false` so `AuthGuard` renders its neutral loading state without redirecting to `/trial-expired`. |
| EC002 | WHEN the user's trial expires while they are navigating the app, the next React Query refetch (window focus or manual invalidation) shall update `useTrialStatus()` to `isExpired = true`, at which point `AuthGuard` shall redirect to `/trial-expired`. |
| EC003 | WHEN the backend returns HTTP 403 with code `TRIAL_EXPIRED` before `useTrialStatus()` has observed the state change, the `api/client.ts` interceptor shall redirect to `/trial-expired` immediately without waiting for the next scheduled refetch. |
| EC004 | WHEN the user is on `/trial-expired` and the "Continue with free" mutation succeeds, the system shall invalidate `getMySubscription`, re-derive `isExpired = false` on the next render, and redirect the browser to `/`. |
| EC005 | WHEN the plan catalog no longer contains a plan with `code === 'free'`, the system shall render `/trial-expired` with the paid plans only and shall not render the "Continue with free" button. |
| EC006 | WHEN the fetched subscription has `status === 'expired'` but another non-terminal subscription exists for the scope (e.g. paid `active` subscription created after the trial), the system shall return `isExpired = false` from `useTrialStatus()` and shall not redirect to `/trial-expired`. |
| EC007 | WHEN `days_remaining` from the backend is `0` while `trial_ends_at` has not yet elapsed, `<TrialBanner />` shall render "Less than 1 day left in your trial — upgrade now" instead of "0 days left". |

## Technical constraints

- Hook lives at `apps/web/src/hooks/useTrialStatus.ts`; banner component lives at `apps/web/src/components/domain/billing/TrialBanner.tsx`; page lives at `apps/web/src/pages/TrialExpired.tsx`.
- `AuthGuard` extensions live in `apps/web/src/components/auth/AuthGuard.tsx`; the trial redirect logic is placed after the existing authentication and onboarding checks and does not duplicate them.
- The 403 `TRIAL_EXPIRED` response interceptor lives in `apps/web/src/api/client.ts` and applies globally to every call routed through `apiFetch`.
- Shared TypeScript types (`SubscriptionStatus`, `Subscription` with `trial_ends_at` and `days_remaining` extensions from SUBS-008) are imported from `@repo/types`; the frontend does not redeclare them.
- Days remaining are always whole days rounded down; the frontend does not recompute this locally from `trial_ends_at`.
- React Query is the only data-fetching mechanism; no bespoke fetch caching layer is introduced.
- `<TrialBanner />` and `<TrialExpired />` are domain components that may call the `useTrialStatus()` hook directly, following the existing exception to the strict layered import rule already used by `<QuotaGate>` and `<EntitlementGate>` in the billing domain.

## Dependencies

- SUBS-008 — `GET /billing/subscriptions/me` extended with `trial_ends_at` and `days_remaining`; HTTP 403 with code `TRIAL_EXPIRED` on protected endpoints; `SubscriptionStatus = 'trialing' | 'expired'` in `@repo/types`.
- SUBS-004 — `<PlanCard />` component, `usePlans()` hook, `useMySubscription()` hook (query key shared with `useTrialStatus`), and the `/pricing` and `/billing/subscribe` routes.
- SUBS-002 — `POST /billing/subscriptions` endpoint used by the "Continue with free" action.
- AUTH-001 — `AuthGuard` component and the authenticated session that scopes `GET /billing/subscriptions/me`.

## Effort estimate

`high` — 15 functional requirements, 3 NFRs, 7 edge cases, and 4 dependencies across a hook, a domain component, a new page, an `AuthGuard` extension, and a global HTTP interceptor.
