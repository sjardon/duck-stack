# LANDING-001 — Landing Base Structure — Tasks

## T001 — Add react-router-dom dependency to landing package.json

In `apps/landing/package.json`, add `"react-router-dom": "^6.0.0"` to the `dependencies` field.

**Covers:** R008

---

## T002 — Create lib/utils.ts with cn and noop helpers

Create `apps/landing/src/lib/utils.ts`. Export:
- `cn(...classes: (string | undefined | false | null)[]): string` — concatenates truthy class-name strings with a single space separator.
- `noop(): void` — no-op placeholder.

Neither function may import React or any third-party library.

**Covers:** R001, R007

---

## T003 — Create api/contact.ts stub

Create `apps/landing/src/api/contact.ts`. Export:
- `ContactPayload` interface with fields `name: string`, `email: string`, `message: string`.
- `ContactResponse` interface with field `ok: boolean`.
- `submitContact(_payload: ContactPayload): Promise<ContactResponse>` — returns `Promise.resolve({ ok: true })` without performing a real network call.

**Covers:** R001, R006, EC001

---

## T004 — Create Button UI primitive

Create `apps/landing/src/components/ui/Button.tsx`. Define `ButtonProps` with `children: React.ReactNode`, optional `onClick?: () => void`, optional `variant?: 'primary' | 'secondary'`, and optional `type?: 'button' | 'submit' | 'reset'`. Export a default functional component `Button(props: ButtonProps): JSX.Element` that renders a `<button>` element. The file must import only from React — no external libraries.

**Covers:** R001, R004, NF002

---

## T005 — Create Badge UI primitive

Create `apps/landing/src/components/ui/Badge.tsx`. Define `BadgeProps` with `label: string` and optional `variant?: 'default' | 'highlight'`. Export a default functional component `Badge(props: BadgeProps): JSX.Element` that renders a `<span>` element. The file must import only from React — no external libraries.

**Covers:** R001, R004, NF002

---

## T006 — Create Navbar layout component

Create `apps/landing/src/components/layout/Navbar.tsx`. Export a default functional component `Navbar(): JSX.Element` that renders a top navigation bar. No props. Stateless. Must not import from `components/sections/` or `components/ui/` domain types.

**Covers:** R001, R002

---

## T007 — Create Footer layout component

Create `apps/landing/src/components/layout/Footer.tsx`. Export a default functional component `Footer(): JSX.Element` that renders a page footer. No props. Stateless. Must not import from `components/sections/`.

**Covers:** R001, R002

---

## T008 — Create Hero section component

Create `apps/landing/src/components/sections/Hero.tsx`. Export a default functional component `Hero(): JSX.Element` that renders a full-width hero block. No props. Stateless. Must not import from any other file in `components/sections/`.

**Covers:** R001, R003, NF001

---

## T009 — Create Features section component

Create `apps/landing/src/components/sections/Features.tsx`. Export a default functional component `Features(): JSX.Element` that renders a feature highlights block. No props. Stateless. Must not import from any other file in `components/sections/`.

**Covers:** R001, R003, NF001

---

## T010 — Create CTA section component

Create `apps/landing/src/components/sections/CTA.tsx`. Export a default functional component `CTA(): JSX.Element` that renders a call-to-action block. May use `Button` from `components/ui/`. Must not import from any other file in `components/sections/`.

**Covers:** R001, R003, NF001

---

## T011 — Create HomePage page component

Create `apps/landing/src/pages/HomePage.tsx`. Export a default functional component `HomePage(): JSX.Element` that composes the full page by rendering `<Navbar />`, `<Hero />`, `<Features />`, `<CTA />`, and `<Footer />` in that order. Imports come only from `../components/layout/` and `../components/sections/`.

**Covers:** R001, R005

---

## T012 — Modify App.tsx to configure React Router

Rewrite `apps/landing/src/App.tsx` to import `BrowserRouter`, `Routes`, `Route`, and `Navigate` from `react-router-dom`, and `HomePage` from `./pages/HomePage`. Export a default functional component `App(): JSX.Element` that renders:

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
</BrowserRouter>
```

**Covers:** R008, EC002
