# WEB-003 — Product analytics y feature flags en `web`

## Reason for being

WEB-002 closed the "we don't know when it breaks" gap: uncaught errors, unhandled rejections, and render failures in `apps/web` are now reported with resolved stack traces, environment, release, and user identifier. What is still missing is the opposite half of the picture — whether the product is used at all. Nothing in `apps/web` records which screens a user visits, which actions they complete, or where they abandon a flow, so every product decision is made on intuition and every bug report that is not an exception ("it didn't work for me") has no trail to follow.

There is also no way to turn a piece of functionality on for a subset of users without shipping it to everyone. The only available lever today is a deploy, which pushes the team toward long-lived branches or all-or-nothing releases. Note that the existing gating primitives (`useEntitlement` / `<EntitlementGate>`, `useQuota` / `<QuotaGate>`, `useTrialStatus`) answer a different question — what the customer has paid for — and are not a substitute for release-time enablement.

**Goal:** record product usage and allow enabling functionality per user without deploying.

## Scope

The requirements cover instrumenting `apps/web` with a product analytics provider: automatic capture of screen views plus explicit capture of relevant product actions as events, attribution of those events to the authenticated user, and session replay for diagnosing reported problems. They also cover a runtime feature-flag capability — the application can ask whether a given flag is enabled for the current user and render accordingly, with changes to a flag taking effect without a new deploy. As with WEB-002, the whole instrumentation is opt-in through public frontend configuration, and its absence must leave the application fully functional.

## Out of scope

- Backend-side evaluation of feature flags
- A/B experiments and their statistical analysis
- Analytics for `apps/landing` (LANDING-003)
- Funnels, reports, and custom dashboards inside the provider
- Cookie consent banner and consent management
- Replacing the existing permission, entitlement, or subscription checks with feature flags

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN the user navigates to a route of the SPA, the system shall record a screen-view event identifying the visited route. |
| R002 | Event-driven | WHEN the user completes one of the product actions designated as relevant, the system shall record an event that names that action. |
| R003 | Conditional | IF a user is authenticated at the moment an event is recorded, THEN the system shall attribute that event to that user's stable identifier. |
| R004 | Ubiquitous | The system shall record user sessions in a form that can be replayed afterwards to diagnose a reported problem. |
| R005 | Event-driven | WHEN the application queries whether a feature flag is enabled for the current user, the system shall return that flag's resolved value and render the enabled or disabled branch accordingly. |
| R006 | Event-driven | WHEN a feature flag's enablement is changed in the provider, the system shall reflect the new value in the running application without requiring a new build or deploy. |
| R007 | Conditional | IF the analytics configuration is present in the frontend build, THEN the system shall initialize the analytics client before the application renders and shall behave according to R001–R006. |
| R008 | Conditional | IF the analytics configuration is absent, THEN the system shall render and operate the application normally with event capture, session replay, and flag resolution disabled, and shall not throw at startup. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Event capture shall not block or delay user interaction: recording an event shall not require a network round-trip to complete before the originating interaction finishes, and shall never be awaited on the interaction path. |
| NF002 | The system shall not include personal data or sensitive content in event payloads: no email, name, phone, address, free-text field contents, or credentials shall be transmitted as event properties. |
| NF003 | Session replay shall mask user data entry: text entered by the user into inputs, textareas, and equivalent editable elements shall be unreadable in the recorded replay. |
| NF004 | A feature flag that cannot be resolved due to a provider failure, timeout, or unavailability shall evaluate to a safe default value, and the interface shall remain usable — no blocking spinner, blank screen, or error surface caused by the unresolved flag. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a component gates rendering on a flag whose value has not yet been resolved, the system shall render the disabled branch (or the caller-supplied loading placeholder) and shall never render the enabled branch first and then remove it, so no visible flicker is produced. *(Assumption: FEATURES.md only states the flicker risk; the conservative behavior adopted is that "unresolved" is rendered identically to "disabled", and the gating primitive exposes an explicit unresolved state so callers can suppress the intermediate render.)* |
| EC002 | WHEN an ad blocker or network policy prevents the provider script from loading, the system shall render and operate the application normally, resolve every flag to its safe default (NF004), record no events, and raise no uncaught exception and no user-visible error. |
| EC003 | WHEN a session replay is recorded on a screen displaying personal data, the system shall mask that content by default — masking shall be opt-out per element rather than opt-in — so no unmasked personal data reaches the provider unless a specific element was explicitly allowed. |
| EC004 | WHEN the user browses before authenticating, the system shall record those events against an anonymous identifier, and WHEN the user subsequently authenticates, the system shall identify the session with the user's stable identifier so the previously anonymous events of that session become attributed to that user. |
| EC005 | WHEN choosing what to instrument, the system shall record only discrete, explicitly designated product actions (R002) and shall not record high-frequency interactions — scroll, pointer movement, or per-keystroke input — so the plan's event quota is not exhausted by automatic capture. |
| EC006 | WHEN a flag is queried before the user is identified and its value changes after identification, the system shall re-evaluate the flag against the identified user and re-render the affected UI with the new value, and shall not keep serving the value resolved for the anonymous context. |

## Technical constraints

- Product analytics and feature flag provider: **PostHog** (single provider for both capabilities).
- Configuration is read from Vite `VITE_`-prefixed environment variables (`import.meta.env`), consistent with the `VITE_CLERK_PUBLISHABLE_KEY` / `VITE_API_URL` / `VITE_ERROR_TRACKING_DSN` convention. These values are embedded in the published bundle and are public by definition; no provider credential that is not safe to publish may be `VITE_`-prefixed.
- The absent-configuration path (R008) must follow the WEB-002 pattern established in `lib/errorTracking.ts`: a single project-owned init module, called from the application entry point, that is a no-op when its configuration is missing and whose initialization is wrapped so a failure never blocks rendering.
- The instrumentation must respect the `apps/web` layered import rule (`api` → `hooks` → `pages` → `components`): client bootstrap belongs at the entry point, flag resolution is exposed through a hook in `hooks/`, and any gating component belongs in `components/`. A cross-cutting hook invoked once above the router (as with `useSyncErrorTrackingUser()`) is the accepted pattern for user identification.
- User attribution must be derived from the existing Clerk session (`@clerk/clerk-react`), using the user identifier only — no name, email, or profile attributes.
- Feature flags must not be used to replace or duplicate the existing entitlement, quota, trial, or permission checks (`useEntitlement`, `useQuota`, `useTrialStatus`); they are a release-enablement mechanism, not an authorization or billing mechanism.
- Depends on WEB-002: the frontend configuration and instrumentation conventions (entry-point init, `VITE_` config, cross-cutting identification hook, PII-minimal payloads) are established there and must be reused rather than reinvented.
