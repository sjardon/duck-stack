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
