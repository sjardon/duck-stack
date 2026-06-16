# WEB-001 — Web App Base Structure — Design

## Problem statement

The `apps/web` Vite + React + TypeScript application exists as an empty scaffold. No layered architecture, HTTP client, server-state manager, client-state stores, or library helpers are in place. Every future domain feature (auth, dashboard, billing) needs a predictable, consistent structure to plug into, and that structure must be established before any domain work begins.

## Alternatives

| Name | Description | Decision |
|------|-------------|----------|
| Feature-first structure | Organise `src/` around domain features (`features/health/`, `features/auth/`), each owning its own api, hooks, components, and pages sub-folders. | Not chosen — analysis.md mandates a layer-first folder layout and a strict directional import rule (`api → hooks → pages → components`) that feature-first colocation obscures. |
| Strict layered structure | Organise `src/` into dedicated layer directories (`api/`, `hooks/`, `pages/`, `components/ui/`, `components/domain/`, `store/`, `lib/`) where imports may only flow downward through the stack. | Chosen — directly satisfies R001–R010 and all four NF constraints; matches the architecture described in analysis.md. |
| Colocation with barrel re-exports | Files colocated by feature with barrel `index.ts` re-exports in each layer directory to expose a flat public API. | Not chosen — the extra indirection makes NF004 import-direction violations harder to detect statically and adds unnecessary complexity for a base-structure feature. |

## Chosen solution

**Strict layered structure.**

Each layer directory has a single responsibility and imports only flow downward: `api` is consumed by `hooks`, `hooks` are consumed by `pages`, and `pages` compose `components`. This satisfies R001 (folder layout), R002 (HTTP client), R003 (React Query bootstrap), R004–R005 (Zustand stores), R006–R007 (library helpers), R008–R010 (health end-to-end example), and all four NF constraints.

## Technical design

### Folder layout (`apps/web/src/`)

```
src/
├── api/
│   ├── client.ts          ← base HTTP client wrapping fetch
│   └── health.ts          ← /health endpoint call
├── hooks/
│   └── useHealth.ts       ← React Query wrapper for api/health
├── pages/
│   └── health/
│       └── HealthPage.tsx ← reference page consuming useHealth
├── components/
│   ├── ui/                ← domain-agnostic presentational components
│   └── domain/            ← domain-aware components receiving data via props
├── store/
│   ├── session.store.ts   ← Zustand store for user session
│   └── ui.store.ts        ← Zustand store for global UI state
├── lib/
│   ├── formatters.ts      ← formatDate, formatCurrency stubs
│   └── utils.ts           ← generic non-React helpers
├── App.tsx                ← root component, renders HealthPage
└── main.tsx               ← entry point, mounts QueryClientProvider
```

### `api/client.ts` contract

```typescript
interface RequestOptions extends RequestInit {
  token?: string; // placeholder for future auth header
}

async function apiFetch<T>(path: string, options?: RequestOptions): Promise<T>
```

- Reads `VITE_API_URL` from `import.meta.env` as the base URL.
- If `options.token` is provided, attaches `Authorization: Bearer <token>`; otherwise omits the header (satisfies EC002).
- Throws a typed `ApiError` (message + status) on non-2xx responses so callers can distinguish network from application errors.

### `api/health.ts` contract

```typescript
interface HealthResponse {
  status: string;
  timestamp: string;
}

async function fetchHealth(): Promise<HealthResponse>
```

Calls `GET /health` through `apiFetch`. Returns the parsed JSON body.

### `hooks/useHealth.ts` contract

```typescript
function useHealth(): UseQueryResult<HealthResponse, ApiError>
```

- Wraps `fetchHealth` with `useQuery({ queryKey: ['health'], queryFn: fetchHealth })`.
- Exposes `data`, `isLoading`, `isError`, and `error` to the consuming page.
- React Query handles retries and error state automatically (satisfies EC001 — HealthPage reads `isError`/`error` and renders a fallback instead of crashing).

### `pages/health/HealthPage.tsx` contract

```tsx
export default function HealthPage(): JSX.Element
```

- Calls `useHealth()`.
- Renders three states: loading skeleton, error message (non-crashing, satisfies EC001), and success display of `status` + formatted `timestamp`.
- Does not call any API function directly (satisfies NF004).

### `store/session.store.ts` contract

```typescript
interface SessionState {
  // extensible — populated by future auth feature
}

const useSessionStore = create<SessionState>()(() => ({}));
```

### `store/ui.store.ts` contract

```typescript
interface UiState {
  // extensible — populated by future UI-state features
}

const useUiStore = create<UiState>()(() => ({}));
```

### `lib/formatters.ts` contract

```typescript
function formatDate(date: Date | string): string  // stub returning ISO string
function formatCurrency(amount: number, currency?: string): string  // stub returning locale string
```

### `lib/utils.ts` contract

```typescript
function noop(): void  // no-op placeholder; no React imports
```

### `main.tsx` changes

Wrap the root render with `QueryClientProvider`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

### `App.tsx` changes

Render `HealthPage` as the initial content so the end-to-end example is exercised on boot:

```tsx
import HealthPage from './pages/health/HealthPage';

export default function App() {
  return <HealthPage />;
}
```

### `package.json` additions

Add runtime dependencies:

```json
"@tanstack/react-query": "^5.0.0",
"zustand": "^4.0.0"
```

### Environment variable

`VITE_API_URL` must be set in `.env` (development default: `http://localhost:3000`). Add a `.env.example` so the variable is discoverable.

## Files

| Action | Path |
|--------|------|
| MODIFY | `apps/web/package.json` |
| MODIFY | `apps/web/src/main.tsx` |
| MODIFY | `apps/web/src/App.tsx` |
| CREATE | `apps/web/src/api/client.ts` |
| CREATE | `apps/web/src/api/health.ts` |
| CREATE | `apps/web/src/hooks/useHealth.ts` |
| CREATE | `apps/web/src/pages/health/HealthPage.tsx` |
| CREATE | `apps/web/src/components/ui/.gitkeep` |
| CREATE | `apps/web/src/components/domain/.gitkeep` |
| CREATE | `apps/web/src/store/session.store.ts` |
| CREATE | `apps/web/src/store/ui.store.ts` |
| CREATE | `apps/web/src/lib/formatters.ts` |
| CREATE | `apps/web/src/lib/utils.ts` |
| CREATE | `apps/web/.env.example` |

## Requirement coverage

| ID | Design decision that satisfies it |
|----|-----------------------------------|
| R001 | Folder layout creates `pages/`, `components/ui/`, `components/domain/`, `api/`, `hooks/`, `store/`, `lib/` under `apps/web/src/`. |
| R002 | `api/client.ts` wraps native `fetch`, exposes `apiFetch<T>`, and reserves `options.token` as the auth-header placeholder. |
| R003 | `main.tsx` is modified to instantiate `QueryClient` and wrap the root with `QueryClientProvider`. |
| R004 | `store/session.store.ts` exports `useSessionStore` created with Zustand and an empty extensible `SessionState` interface. |
| R005 | `store/ui.store.ts` exports `useUiStore` created with Zustand and an empty extensible `UiState` interface. |
| R006 | `lib/formatters.ts` exports `formatDate` and `formatCurrency` stub functions. |
| R007 | `lib/utils.ts` exports generic helpers with no React imports. |
| R008 | `api/health.ts` calls `GET /health` via `apiFetch` and returns `HealthResponse`. |
| R009 | `hooks/useHealth.ts` wraps `fetchHealth` in `useQuery` and exposes the full React Query result to pages. |
| R010 | `pages/health/HealthPage.tsx` consumes `useHealth`, renders loading/error/success states, and acts as the reference layering example. |
| NF001 | Only `HealthPage` (a page component) calls `useHealth`; `components/ui/` and `components/domain/` contain no hook calls. |
| NF002 | `components/ui/` placeholder contains no imports from `@repo/types`; the `.gitkeep` file and convention are documented here. |
| NF003 | `components/domain/` placeholder convention: domain components receive data via props only; `HealthPage` demonstrates this. |
| NF004 | Import direction enforced by design: `api/health.ts` ← `hooks/useHealth.ts` ← `pages/health/HealthPage.tsx` ← `App.tsx`; no inversions exist. |
| EC001 | `useHealth` surfaces React Query `isError`/`error`; `HealthPage` renders a non-crashing error message when `isError` is true. |
| EC002 | `apiFetch` omits the `Authorization` header when `options.token` is absent rather than throwing, keeping the client usable before auth is implemented. |
