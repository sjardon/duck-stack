# LANDING-001 — Landing Base Structure — Design

## Problem statement

The `apps/landing` app currently exists as an empty Vite + React + TypeScript shell with a single placeholder component and no internal organisation. Before any marketing content or product sections can be added, the app needs a well-defined folder structure, reusable layout and section components, local UI primitives, a home page that composes them, a stub contact API module, a helpers module, and a minimal React Router setup — all without React Query, Zustand, or domain types, in line with the lightweight nature of a marketing SPA.

## Chosen solution

**Layered marketing SPA structure**

A single, flat layer model adapted from the `apps/web` hexagonal approach but stripped of data-fetching and state management concerns. Folders map directly to responsibility: `components/layout/` for structural chrome, `components/sections/` for independent marketing blocks, `components/ui/` for domain-agnostic primitives, `pages/` for route-level composition, `api/` for network stubs, and `lib/` for React-free helpers. React Router is wired in `App.tsx` with a single `<Route path="/" element={<HomePage />} />` and a catch-all redirect to `/` to satisfy EC002.

This solution satisfies R001–R008 directly: each requirement maps 1-to-1 to a folder or file created by the design. NF001 is met because each section component receives no shared state and has no import dependency on any other section. NF002 is met because `components/ui/` components import only React. EC001 is met by making the `submitContact` stub return a resolved `Promise` without calling `fetch`. EC002 is met by the catch-all route.

`react-router-dom` must be added as a runtime dependency to `apps/landing/package.json` since the current package has no routing library.

## Technical design

### Folder structure

```
apps/landing/src/
├── api/
│   └── contact.ts
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── sections/
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   └── CTA.tsx
│   └── ui/
│       ├── Button.tsx
│       └── Badge.tsx
├── lib/
│   └── utils.ts
├── pages/
│   └── HomePage.tsx
├── App.tsx          ← modified: add Router + routes
└── main.tsx         ← unchanged
```

### Component contracts

#### `components/layout/Navbar.tsx`
```ts
export default function Navbar(): JSX.Element
```
Renders a top navigation bar. No props. Stateless.

#### `components/layout/Footer.tsx`
```ts
export default function Footer(): JSX.Element
```
Renders a page footer. No props. Stateless.

#### `components/sections/Hero.tsx`
```ts
export default function Hero(): JSX.Element
```
Full-width hero block. No props. Stateless. Independent of other sections.

#### `components/sections/Features.tsx`
```ts
export default function Features(): JSX.Element
```
Feature highlights block. No props. Stateless. Independent of other sections.

#### `components/sections/CTA.tsx`
```ts
export default function CTA(): JSX.Element
```
Call-to-action block. No props. Stateless. Independent of other sections.

#### `components/ui/Button.tsx`
```ts
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit' | 'reset';
}
export default function Button(props: ButtonProps): JSX.Element
```
No imports beyond React.

#### `components/ui/Badge.tsx`
```ts
interface BadgeProps {
  label: string;
  variant?: 'default' | 'highlight';
}
export default function Badge(props: BadgeProps): JSX.Element
```
No imports beyond React.

#### `pages/HomePage.tsx`
```ts
export default function HomePage(): JSX.Element
```
Composes `<Navbar />`, `<Hero />`, `<Features />`, `<CTA />`, `<Footer />` in order. Imports only from `components/layout/` and `components/sections/`.

#### `api/contact.ts`
```ts
export interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

export interface ContactResponse {
  ok: boolean;
}

export async function submitContact(
  _payload: ContactPayload,
): Promise<ContactResponse> {
  // Stub: returns a resolved response without a real network call.
  return Promise.resolve({ ok: true });
}
```

#### `lib/utils.ts`
```ts
// No React imports.
export function cn(...classes: (string | undefined | false | null)[]): string
export function noop(): void
```
`cn` concatenates truthy class-name values separated by a space. `noop` is a no-op placeholder. Neither function imports React.

#### `App.tsx` (modified)
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```
The `<Navigate to="/" replace />` catch-all satisfies EC002.

### Dependency change

`react-router-dom` (v6) must be added to the `dependencies` field of `apps/landing/package.json`.

## Files

| Action   | Path |
|----------|------|
| MODIFY   | `apps/landing/package.json` |
| MODIFY   | `apps/landing/src/App.tsx` |
| CREATE   | `apps/landing/src/pages/HomePage.tsx` |
| CREATE   | `apps/landing/src/components/layout/Navbar.tsx` |
| CREATE   | `apps/landing/src/components/layout/Footer.tsx` |
| CREATE   | `apps/landing/src/components/sections/Hero.tsx` |
| CREATE   | `apps/landing/src/components/sections/Features.tsx` |
| CREATE   | `apps/landing/src/components/sections/CTA.tsx` |
| CREATE   | `apps/landing/src/components/ui/Button.tsx` |
| CREATE   | `apps/landing/src/components/ui/Badge.tsx` |
| CREATE   | `apps/landing/src/api/contact.ts` |
| CREATE   | `apps/landing/src/lib/utils.ts` |

## Requirement coverage

| ID    | Design decision |
|-------|-----------------|
| R001  | Folder structure `components/layout/`, `components/sections/`, `components/ui/`, `pages/`, `api/`, `lib/` is created under `apps/landing/src/`. |
| R002  | `Navbar.tsx` and `Footer.tsx` are created in `components/layout/`. |
| R003  | `Hero.tsx`, `Features.tsx`, and `CTA.tsx` are created in `components/sections/`. |
| R004  | `Button.tsx` and `Badge.tsx` are created in `components/ui/`. |
| R005  | `pages/HomePage.tsx` composes all layout and section components into a single page. |
| R006  | `api/contact.ts` exports `submitContact` as a stub that resolves without a network call. |
| R007  | `lib/utils.ts` exports `cn` and `noop` with no React dependencies. |
| R008  | `App.tsx` is modified to wrap the app in `BrowserRouter` with a `/` route and a `*` catch-all. |
| NF001 | Each section component in `components/sections/` has no imports from other section files and receives all data (none, in this case) via props; order of composition is controlled exclusively by `HomePage.tsx`. |
| NF002 | `Button.tsx` and `Badge.tsx` import only React; no external library dependencies. |
| EC001 | `submitContact` returns `Promise.resolve({ ok: true })` without calling `fetch`. |
| EC002 | `<Route path="*" element={<Navigate to="/" replace />} />` redirects unknown routes to `/` without crashing. |
