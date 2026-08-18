# web — Module Specification

Living spec of the current functional state of the `apps/web` React SPA.

---

## Base structure (WEB-001)

`apps/web/src` is organised into strict layer directories: `api/`, `hooks/`, `pages/`, `components/ui/`, `components/domain/`, `store/`, and `lib/`. Imports flow in one direction only — `api` is consumed by `hooks`, `hooks` are consumed by `pages`, and `pages` compose `components`. No layer may invert this direction.

### HTTP client

`api/client.ts` exposes `apiFetch<T>(path, options?)` which wraps the native `fetch` API against the `VITE_API_URL` environment variable. When `options.token` is provided the function attaches an `Authorization: Bearer` header; when absent it omits the header without throwing, keeping the client usable before auth is implemented. Non-2xx responses throw a typed `ApiError` carrying message and status so callers can distinguish network failures from application errors.

### Server-state management

`main.tsx` instantiates a `QueryClient` and wraps the application root with `QueryClientProvider`, making React Query (`@tanstack/react-query`) available to every component and hook in the tree.

### Client-state stores

Two Zustand stores are wired:

| Store | Path | Purpose |
|-------|------|---------|
| `useSessionStore` | `store/session.store.ts` | User session data — empty base shape, extensible by future auth features |
| `useUiStore` | `store/ui.store.ts` | Global UI state — empty base shape, extensible by future UI features |

### Library helpers

`lib/formatters.ts` exports `formatDate` and `formatCurrency` stubs. `lib/utils.ts` exports generic helpers with no React dependencies.

### Health end-to-end example

`api/health.ts` calls `GET /health` on the backend through `apiFetch`. `hooks/useHealth.ts` wraps that call with `useQuery` and exposes `data`, `isLoading`, `isError`, and `error` to the page. `pages/health/HealthPage.tsx` consumes `useHealth` and renders loading, error (non-crashing fallback), and success states. This vertical slice is the canonical reference for how every future feature must implement its own api → hook → page chain.

### Layering constraints

- Only page components invoke data-fetching hooks.
- `components/ui/` components are domain-agnostic and do not import from `@repo/types`.
- `components/domain/` components receive all data via props from pages and never call the API layer directly.

## Error tracking (WEB-002)

`apps/web` reports uncaught errors, unhandled promise rejections, and render failures to Better Stack via the Sentry SDK for React (`@sentry/react`), mirroring the provider and account conventions already established for the backend (SERVICES-011).

### Initialization and gating

`lib/errorTracking.ts` exports `initErrorTracking()`, called synchronously in `main.tsx` before `createRoot(...).render(...)`. `readErrorTrackingConfig()` reads `VITE_ERROR_TRACKING_DSN` (public, `import.meta.env`); when absent the function returns `null` and `initErrorTracking()` is a no-op — the application renders and operates normally with reporting disabled and without throwing at startup. When present, `Sentry.init()` is called with `environment` (`VITE_ENVIRONMENT`, defaults to `"production"`) and `release` (`VITE_RELEASE`), wrapped in `try/catch` so a provider initialization failure is logged and swallowed rather than blocking the app from rendering. `Sentry.init()`'s default integrations install the global `window.onerror`/`unhandledrejection` handlers, so no hand-written listener code exists.

### Report scrubbing

`beforeSend` in `errorTracking.ts` drops events whose every stack frame originates from a browser extension URL scheme (`isThirdPartyError()`), and trims any `event.user` to `{ id }` only. `Sentry.init` also sets `sendDefaultPii: false` as defense in depth. No personal data or form contents are ever included in a report payload.

### Render-error boundary

`components/error/AppErrorBoundary.tsx` wraps `Sentry.ErrorBoundary` (`showDialog={false}`) around the application tree in `main.tsx`, between `QueryClientProvider` and `App`. On a render error it reports via `captureException` internally and renders `components/error/ErrorFallback.tsx` — static markup plus a reload action only, with no hooks, no `@repo/types`, and no provider-dependent state, so the fallback itself has no failure path.

### User attribution

`hooks/use-sync-error-tracking-user.ts` exports `useSyncErrorTrackingUser()`, invoked once from `App.tsx` (above the router, so attribution holds for every route). It calls `Sentry.setUser({ id: user.id })` when a Clerk session is present, or `Sentry.setUser(null)` when not — an unauthenticated error is still reported, just without an identifier. This is a documented cross-cutting exception to "only page components invoke data-fetching hooks," alongside `TrialBanner` and `AppLayout`'s direct `<UserButton/>` usage: the hook makes no React Query call.

### Source maps and release publication

`vite.config.ts` gates source-map generation and upload on `Boolean(process.env.SENTRY_AUTH_TOKEN)` (`sourceMapsEnabled`). When the token is absent (e.g. a local `pnpm build` without deploy credentials), `build.sourcemap` is `false` and no `.map` files are ever produced. When present, `build.sourcemap` is `true`, `@sentry/vite-plugin` uploads `dist/**/*.map` under the same `VITE_RELEASE` identifier the runtime reports, deletes the maps from `dist` afterward (`sourcemaps.filesToDeleteAfterUpload`) so they never ship next to the published bundle, and is configured with an explicit `errorHandler` that rethrows on upload failure — this overrides the plugin's own default of swallowing upload failures, so a failed upload now fails `vite build`, which aborts `.cloudflare/deploy.sh` before `wrangler pages deploy` runs instead of silently shipping a release with unresolvable stack traces. `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_URL` are read only from `process.env` in the Node build context of `vite.config.ts` and are never `VITE_`-prefixed, so they are structurally unreachable from the client bundle.
