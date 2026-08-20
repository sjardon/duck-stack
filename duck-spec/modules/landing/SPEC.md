# landing — Module Specification

Living functional specification of the `apps/landing` SPA. Describes what the module currently does.

---

## Base structure (LANDING-001)

`apps/landing` is a Vite + React + TypeScript marketing SPA. Its `src/` directory is organised into six responsibility folders:

| Folder | Responsibility |
|--------|---------------|
| `components/layout/` | Structural chrome components (`Navbar`, `Footer`) shared across all pages |
| `components/sections/` | Independent marketing section blocks (`Hero`, `Features`, `CTA`) |
| `components/ui/` | Domain-agnostic UI primitives (`Button`, `Badge`) with no dependencies beyond React |
| `pages/` | Route-level composition components (`HomePage`) |
| `api/` | Network modules; currently a stub (`contact.ts`) that resolves without a real call |
| `lib/` | React-free generic helpers (`cn`, `noop` in `utils.ts`) |

The app exposes a single route (`/`) that renders `HomePage`, which composes `Navbar`, `Hero`, `Features`, `CTA`, and `Footer` in order. All unknown routes are redirected to `/` via a React Router catch-all, preventing crashes on unrecognised paths.

Marketing sections in `components/sections/` are stateless, accept no props, and have no cross-section imports, making them independently composable in any order within a page.

`components/ui/` primitives (`Button`, `Badge`) import only React and carry no external library dependencies.

The `api/contact.ts` module exports `submitContact`, which currently returns a resolved `Promise` without performing a real network call. This keeps the base structure functional before a backend contact endpoint exists.

React Query, Zustand, and domain types from `@repo/types` are intentionally absent from this app.

---

## Error tracking (LANDING-002)

`apps/landing` reports uncaught errors, unhandled promise rejections, and render failures to Better Stack via the Sentry SDK for React (`@sentry/react`), reusing the mechanism WEB-002 established for `apps/web` as-is, with no user attribution (the landing is anonymous).

### Initialization and gating

`lib/errorTracking.ts` exports `initErrorTracking()`, called synchronously in `main.tsx` before `createRoot(...).render(...)`. `readErrorTrackingConfig()` reads `VITE_ERROR_TRACKING_DSN` (public, `import.meta.env`); when absent it returns `null` and `initErrorTracking()` is a no-op — the landing renders and operates normally with reporting disabled and without throwing at startup. When present, `Sentry.init()` is called with `environment` (`VITE_ENVIRONMENT`, defaults to `"production"`) and `release` (`VITE_RELEASE`), wrapped in `try/catch` so a provider initialization failure is logged and swallowed rather than blocking the landing from rendering. `Sentry.init()`'s default integrations install the global `window.onerror`/`unhandledrejection` handlers.

### Report scrubbing (anonymous by design)

`beforeSend` (`scrubEvent`) strips `event.user` from every report defensively — the landing has no auth provider and never calls `Sentry.setUser`, so this is a safety net, not a real code path. `sendDefaultPii: false` is set as defense in depth. No session-replay or user-feedback Sentry integration is registered, so DOM input values from the contact form are never captured.

### Render-error boundary

`components/error/AppErrorBoundary.tsx` wraps `Sentry.ErrorBoundary` (`showDialog={false}`) around `<App/>` in `main.tsx`. On a render error it reports via `captureException` internally and renders `components/error/ErrorFallback.tsx` — static markup plus a reload action only, with no hooks, no `@repo/types`, and no provider-dependent state.

### Source maps and release publication

`vite.config.ts` gates source-map generation and upload on `Boolean(process.env.SENTRY_AUTH_TOKEN)` (`sourceMapsEnabled`), identical to `apps/web`. When absent, `build.sourcemap` is `false` and no `.map` files are produced. When present, `@sentry/vite-plugin` uploads `dist/**/*.map` under the same `VITE_RELEASE` identifier the runtime reports, then deletes the maps from `dist` (`sourcemaps.filesToDeleteAfterUpload`) so they never ship next to the published bundle; no custom `errorHandler` override is passed, so the plugin's default rethrow on upload failure fails `vite build`, which aborts `.cloudflare/deploy.sh` before `wrangler pages deploy` runs. `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_URL` are read only from `process.env` in the Node build context of `vite.config.ts` and are never `VITE_`-prefixed.

---

## Conversion analytics (LANDING-003)

`apps/landing` records visits, traffic origin, and the registration hand-off through PostHog (`posthog-js`), the same provider and project `apps/web` uses (WEB-003), and carries its anonymous visitor identity across the cross-origin hand-off to `apps/web` so the pre-registration and post-registration halves of the journey resolve to a single PostHog person.

### Initialization and gating

`lib/analytics.ts` exports `readAnalyticsConfig()` (reads `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST`, `null` when the key is absent) and `initAnalytics()`, called synchronously in `main.tsx` alongside `initErrorTracking()`, before `createRoot(...).render(...)`. When config is absent, `initAnalytics()` is a no-op — the landing renders and its CTA/pricing hand-off navigation behave exactly as when analytics is configured, just without recording anything. When present, `posthog.init()` is called wrapped in `try/catch`, with `capture_pageview: false` (visits are captured explicitly), `autocapture: false`, `capture_heatmaps: false`, and `disable_session_recording: true` — session replay and autocapture are out of scope for the landing. `captureEvent(name, properties)` wraps `posthog.capture()` as the single entry point for recording an event, and is a documented no-op before `initAnalytics()` has run. `getDistinctId()` wraps `posthog.get_distinct_id()` in `try/catch`, returning `null` when analytics was never initialized.

### Visit recording and traffic origin

`components/analytics/RouteVisitTracker.tsx`, mounted inside `<BrowserRouter>` in `App.tsx`, records a `landing_page_viewed` event (with the visited route) on mount and on every route change. Before capturing, it registers the visit's traffic origin — the five `utm_*` query parameters plus `document.referrer`, parsed by `lib/attribution.ts`'s `parseTrafficOrigin()` — as PostHog super properties via `registerTrafficOrigin()`, so the origin is attached to every subsequent event automatically. First-touch origin is written with `posthog.register_once()` and is never overwritten by a later visit; last-touch origin is written with `posthog.register()` and always reflects the current visit, so both are retained side by side rather than one replacing the other.

### Conversion hand-off and identity propagation

`components/sections/CTA.tsx` ("Get early access") and `components/sections/Pricing.tsx` (per-plan action) both record a `registration_started` event synchronously before navigating away, then perform the existing full-page, cross-origin navigation to `VITE_WEB_URL`. `lib/conversion.ts`'s `hasConverted()`/`markConverted()` guard that call with a `localStorage` flag, so a visitor who has already triggered a hand-off in this browser does not produce a second conversion event on a repeat visit or a repeat click. `lib/handoff.ts`'s `buildHandoffUrl(path)` builds the destination URL and, when `getDistinctId()` returns a value, appends the landing's PostHog `distinct_id` as a `landing_id` query parameter; when analytics is unconfigured or the distinct id is unavailable, it falls back to the destination URL unchanged, so the CTA and pricing hand-off always work regardless of analytics configuration.

### Cross-module contract with `apps/web`

The `landing_id` query parameter appended by `buildHandoffUrl()` is the contract between `apps/landing` and `apps/web`: `apps/web`'s `adoptPropagatedIdentity()` (in `apps/web/src/lib/analytics.ts`) reads `landing_id` from the incoming URL at bootstrap and calls `posthog.identify(landingId)` before its own user-identification call runs, chaining the anonymous-to-known merge so landing-recorded and app-recorded events resolve to one PostHog person. When the parameter is absent — analytics unconfigured, a blocker, or any other arrival path — `apps/web` silently continues with its own locally generated anonymous identity.
