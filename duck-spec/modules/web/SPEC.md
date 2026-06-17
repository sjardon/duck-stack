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
