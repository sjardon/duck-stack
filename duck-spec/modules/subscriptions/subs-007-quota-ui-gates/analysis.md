# SUBS-007 — Quota UI Gates

## Reason for being

SUBS-006 exposes per-scope usage counters and thresholds via `GET /billing/quotas/me`, but there is currently no frontend primitive that consumes this state. As a result, the product cannot hide, disable, or visually flag features based on the user's current usage, nor surface contextual upgrade prompts when the user nears or reaches a quota limit.

This feature introduces a React hook and a gate component on `apps/web` that read the quota state from the backend and render `normal`, `soft_exceeded`, and `hard_exceeded` variants, including a context-aware upgrade CTA that only appears when the current plan is not already the most expensive one in the catalog.

## Scope

Defines a React Query–backed `useQuota(name)` hook and a `<QuotaGate>` component in `apps/web` that consume `GET /billing/quotas/me` (SUBS-006) and `GET /billing/plans` (SUBS-001/SUBS-004) to render quota-aware UI. The component supports three states (`normal`, `soft_exceeded`, `hard_exceeded`) and renders an upgrade CTA pointing to the next more expensive plan when applicable, or an informational message when the user is already on the top plan. Server-side enforcement remains owned by SUBS-006 and is not duplicated here.

## Out of scope

- Server-side enforcement of quota limits (owned by SUBS-006).
- A visual usage meter component (e.g. `<QuotaMeter />` progress bar) — may be added later.
- Advanced render-prop based custom fallbacks; consumers pass a simple `ReactNode`.
- Animations or transitions between quota states.
- Real-time polling of usage; refresh happens only via React Query `staleTime` expiry or manual invalidation.
- Toast or notification when a quota transitions from `normal` to `soft_exceeded` mid-session.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN `useQuota(name)` mounts in a component, the system shall fetch `GET /billing/quotas/me` through React Query under a shared query key and return the entry whose `name` matches the requested quota along with `isLoading`. |
| R002 | Conditional | IF the response from `GET /billing/quotas/me` does not contain an entry for the requested `name`, THEN the system shall return `state = 'normal'` and `hard_limit = Infinity` from `useQuota`. |
| R003 | Ubiquitous | The system shall expose `count`, `soft_limit`, `hard_limit`, `state`, `period_end`, and `isLoading` as the return shape of `useQuota(name)`. |
| R004 | Conditional | IF `<QuotaGate name="...">` resolves `state === 'hard_exceeded'`, THEN the system shall render the `fallbackBlocked` prop, or — when `fallbackBlocked` is not provided — a default blocked fallback with the message "You have reached the limit of your plan" plus an upgrade CTA when applicable. |
| R005 | Conditional | IF `<QuotaGate name="...">` resolves `state === 'soft_exceeded'`, THEN the system shall render `children` together with the `fallbackWarning` element (or a default warning element with upgrade CTA when applicable) as an overlay or adjacent banner. |
| R006 | Conditional | IF `<QuotaGate name="...">` resolves `state === 'normal'`, THEN the system shall render `children` without any added warning or blocked decoration. |
| R007 | Ubiquitous | The system shall give `hard_exceeded` precedence over `soft_exceeded` and `normal` when selecting which branch to render. |
| R008 | Conditional | IF the user's current plan is not the plan with the highest `price` in the catalog returned by `GET /billing/plans`, THEN the system shall render the upgrade CTA inside the blocked and warning fallbacks and link it to `/billing/subscribe?plan=<next-plan-code>`, where `<next-plan-code>` is the code of the next plan ordered by ascending `price` with `price > currentPlan.price`. |
| R009 | Conditional | IF the user's current plan is the most expensive plan in the catalog and the quota state is `soft_exceeded` or `hard_exceeded`, THEN the system shall render the message "You are on our highest plan — contact us for custom limits" in place of the upgrade CTA. |
| R010 | Ubiquitous | The system shall expose a helper hook `useInvalidateQuotas()` that invalidates the React Query cache entry for `GET /billing/quotas/me` so consumers can refresh quota state after mutations that consume a quota. |
| R011 | Ubiquitous | The system shall extend the `apps/web/src/api/billing.ts` client with a `getMyQuotas()` function that performs the authenticated `GET /billing/quotas/me` call and returns the typed response. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | All instances of `useQuota` and `<QuotaGate>` mounted in the same session shall share a single React Query cache entry for `GET /billing/quotas/me`, issuing at most one network request per `staleTime` window (target `staleTime` of 60 seconds). |
| NF002 | The React Query configuration for `GET /billing/quotas/me` shall refetch on window focus so the UI reflects updated usage when the user returns to the tab. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `useQuota(name)` is consumed before the initial fetch resolves, the system shall return `isLoading = true` together with `state = 'normal'` so the gate renders `children` without blocking the tree during first load. |
| EC002 | WHEN the authenticated scope has no prior subscription and the backend lazily creates a free subscription on first call to `GET /billing/quotas/me`, the system shall consume the resulting quotas array transparently with no extra branching in `useQuota` or `<QuotaGate>`. |
| EC003 | WHEN the user's current plan has been disabled and removed from the catalog returned by `GET /billing/plans` and no plan in the catalog has a higher `price`, the system shall treat the user as being on the top plan and shall hide the upgrade CTA (rendering the informational top-plan message instead, when state is `soft_exceeded` or `hard_exceeded`). |
| EC004 | WHEN `period_end` for a quota has already elapsed but the backend has not yet rolled the counter over (because no quota-consuming request has occurred), the system shall render the quota state exactly as returned by the backend without recomputing the period locally. |
| EC005 | WHEN a consumer performs a mutation that the backend counts against a quota, the system shall require the consumer to call `useInvalidateQuotas()` to refresh the cached quota response; absent that call, the system shall continue to serve the previously cached values until `staleTime` expires or the window regains focus. |

## Technical constraints

- Hook lives at `apps/web/src/hooks/useQuota.ts`; gate component lives at `apps/web/src/components/domain/billing/QuotaGate.tsx`.
- The billing API client at `apps/web/src/api/billing.ts` is extended with `getMyQuotas()`; no other client modules are introduced.
- Shared TypeScript types `QuotaName`, `QuotaUsage`, and `QuotaState` are imported from `@repo/types` (defined by SUBS-006) — the frontend does not redeclare them.
- The plan catalog is consumed through the existing `usePlans()` hook (SUBS-004); "next plan" resolution sorts plans by `price` ascending and selects the first entry with `price > currentPlan.price`.
- React Query is the only data-fetching mechanism; no bespoke fetch caching layer is introduced.

## Dependencies

- SUBS-006 — `GET /billing/quotas/me` endpoint and shared `QuotaName` / `QuotaUsage` / `QuotaState` types.
- SUBS-004 — `usePlans()` hook and the billing client API surface that this feature extends.
- SUBS-001 — plan catalog with `code` and `price` fields used to resolve the "next plan".
- AUTH-001 — authenticated session required by `GET /billing/quotas/me` to resolve the scope.
