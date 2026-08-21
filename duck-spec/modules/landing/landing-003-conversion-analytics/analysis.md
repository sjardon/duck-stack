# LANDING-003 — Analítica de conversión en `landing`

## Reason for being

LANDING-002 made the landing's failures visible, and WEB-003 instrumented product usage inside `apps/web`. The segment before both is still dark: nothing records how many people reach the landing, where that traffic comes from, or how many of those visitors end up registering. `apps/landing` today loads only the error-tracking client at its entry point; its pricing action hands the visitor off to the app with a full-page navigation to a different origin (`VITE_WEB_URL`) carrying no analytics identity at all, and its primary "Get early access" CTA has no navigation target whatsoever.

Without that data, every change to the landing's message or structure is evaluated by intuition, and the user journey stays split into two halves that cannot be joined: what happens before registration and what happens after.

**Goal:** measure landing traffic and its conversion into registrations, linking the anonymous visitor with the user account that is later created so the full journey becomes a single, continuous path.

## Scope

The requirements cover instrumenting `apps/landing` with the same analytics provider used by the product: recording landing visits together with the traffic origin that produced them, giving the primary CTA a real destination so its conversion path exists, and recording the conversion event from the landing at the moment it hands the visitor off to the registration flow. They also cover carrying the visitor's anonymous identity across the landing → app origin boundary so that the identity can be linked to the user identifier once the account exists, and guaranteeing that a visitor who is already a registered user does not produce a second conversion. As with LANDING-002 and WEB-003, the whole instrumentation is opt-in through public frontend configuration, and its absence must leave the landing fully functional.

## Out of scope

- Feature enablement and experiments on the landing
- Session replay on the landing
- Cookie consent banner and consent management
- Custom reports and dashboards inside the provider
- Product analytics inside `apps/web` (WEB-003)
- Integration with advertising platforms

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a visitor loads or navigates to a landing route, the system shall record a visit event identifying the visited route. |
| R002 | Event-driven | WHEN a visit event is recorded, the system shall attach the traffic origin of that visit (campaign parameters present in the URL and the referring source) as properties of the event. |
| R003 | Event-driven | WHEN the visitor activates a landing action that hands off to the registration flow, the landing shall record the conversion event naming that action at the moment of the hand-off, before the navigation leaves the landing. |
| R004 | Ubiquitous | The system shall assign every landing visitor a stable anonymous identifier and keep it associated with that visitor's visits and conversion events across the visitor's navigation within the landing. |
| R005 | Event-driven | WHEN the landing hands the visitor off to the application's registration entry point, the system shall propagate the visitor's anonymous identifier in that navigation so the application resolves the incoming visitor to the same analytics identity under which the landing already recorded the conversion event (R003). |
| R006 | Event-driven | WHEN a user account exists for a visitor whose anonymous identifier was propagated (R005), the system shall link that anonymous identifier to the user's stable identifier, so the visits and the conversion event the landing recorded before registration are attributed to the same person as the events recorded after it. |
| R007 | Event-driven | WHEN the visitor activates the primary "Get early access" CTA, the system shall navigate to the application's registration entry point at `VITE_WEB_URL`, so the CTA follows the same instrumented hand-off path as the pricing action (R003, R005). |
| R008 | Conditional | IF the visitor's analytics identity already resolves to a registered user, THEN the system shall not record a new conversion event for that hand-off; the registration conversion shall be recorded at most once per user identity. |
| R009 | Conditional | IF the analytics configuration is present in the landing build, THEN the system shall initialize the analytics client before the landing renders and shall behave according to R001–R008. |
| R010 | Conditional | IF the analytics configuration is absent, THEN the system shall render and operate the landing normally — including the CTA navigation of R007 — with visit recording, conversion recording, and identity propagation disabled, and shall not throw at startup. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Instrumentation shall not perceptibly delay the landing's initial load or its hand-off: client setup shall not block first render, and the conversion event of R003 shall not require a network round-trip to complete before the navigation to the application is issued. |
| NF002 | The system shall not transmit data that identifies the visitor before the visitor identifies themselves: no email, name, phone, address, or contents of fields the visitor fills in shall be included in any event payload; only the anonymous identifier, the visited route, and the traffic origin shall be sent. |
| NF003 | The link between anonymous visitor and registered user shall survive the cross-origin hand-off: after a visitor navigates from the landing deployment to the application deployment and registers, the landing-recorded events and the application-recorded events shall resolve to a single person in the provider, not to two separate ones. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a visitor navigates from the landing to the application (two separate deployments on different origins, reached through a full-page navigation), the system shall carry the landing's anonymous identifier in the navigation itself rather than relying on shared browser storage, and the application shall adopt that identifier for the incoming session; IF no identifier arrives with the navigation, THEN the application shall continue with its own locally generated anonymous identifier, record the session normally, and surface no error to the visitor. *(Assumption: FEATURES.md only states that the journey breaks if the identifier is not shared; the conservative behavior adopted is explicit in-navigation propagation with a silent, non-failing fallback.)* |
| EC002 | WHEN a browser blocker or network policy prevents the analytics client or its requests from reaching the provider, the system shall render and navigate the landing normally — the hand-off of R003/R007 shall still complete — record no events, raise no uncaught error and no unhandled rejection, and issue no retry loop for the blocked requests. *(Assumption: FEATURES.md states that blockers bias marketing traffic measurement but prescribes no behavior; the conservative behavior adopted — consistent with LANDING-002/EC003 — is that a blocked send is a silent no-op and the sampling bias is accepted, not compensated.)* |
| EC003 | WHEN a visitor first arrives carrying a traffic origin, leaves, and later returns through a path that carries none, the system shall retain the origin recorded on the first visit and attribute the eventual conversion to it, and shall never overwrite a previously recorded origin with an empty value; the origin of the current visit shall be recorded alongside it rather than replacing it. *(Assumption: FEATURES.md only states that the origin is lost; the conservative behavior adopted is to preserve first-touch attribution while still recording last-touch as a separate property.)* |
| EC004 | WHEN a visitor whose analytics identity already resolves to a registered user visits the landing and activates a registration hand-off, the system shall record the visit against that existing identity and shall suppress the conversion event (R008), so a repeat visit or a repeated hand-off by the same user never increments the registration conversion count a second time. |
| EC005 | WHEN the account creation itself completes inside the external authentication provider — outside the landing's runtime — the system shall not wait for or depend on that completion to record the conversion: the conversion event is recorded by the landing at hand-off time (R003), and the application side contributes only the identity link of R006 once the account exists. The consequence is explicit and accepted: the recorded conversion counts registration intent at the hand-off boundary, so a visitor who abandons the external registration flow is included in the conversion count, and completed-registration rate is derived afterwards by joining the landing conversion with the linked user identity rather than by a second landing-side event. |

## Technical constraints

- Analytics provider: **PostHog**, the same provider that instruments the product (WEB-003), so both halves of the journey live in the same project and the identity link is resolvable within a single provider.
- The analytics project and the user identification model (`posthog.identify(user.id)`, identifier only, no name or email) are defined by WEB-003 and must be reused, not redefined.
- Configuration is read from Vite `VITE_`-prefixed environment variables (`import.meta.env`), following the convention established by LANDING-002 and WEB-003 (`VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`). These values are embedded in the published bundle and are public by definition; no provider credential that is not safe to publish may carry a `VITE_` prefix.
- The absent-configuration path (R010) must follow the LANDING-002 pattern in `lib/errorTracking.ts`: a single project-owned init module in `lib/`, called synchronously from `main.tsx` before `createRoot(...).render(...)`, that is a no-op when its configuration is missing and whose initialization is wrapped so a failure never blocks rendering.
- The conversion event is owned by `apps/landing` (R003). `apps/web` must not emit a duplicate registration conversion; its only responsibility in this feature is adopting the propagated identifier and completing the identity link (R006).
- The instrumentation must respect the `apps/landing` flat layer model: React-free bootstrap and hand-off logic belongs in `lib/`, event calls belong to the components that own the action (`components/sections/CTA.tsx`, `components/sections/Pricing.tsx`), and `components/ui/` must keep importing nothing beyond React — the CTA wiring of R007 must not push a destination or an analytics call into `components/ui/Button.tsx`.
- `apps/landing` deliberately omits React Query, Zustand and `@repo/types`; this feature must not introduce any of them.
- The landing has no authentication provider and must remain anonymous in its own runtime (NF002); identification with a user identifier happens only on the application side (R006).
- Landing → application hand-off is a full-page navigation to a different origin (`VITE_WEB_URL`, as already used by `components/sections/Pricing.tsx`), so browser storage is not shared between the two deployments and identity continuity must be solved at the navigation level (EC001).
- `components/sections/CTA.tsx` currently renders "Get early access" with no destination; R007 brings that wiring into scope for this feature.
- Depends on **LANDING-002**: the landing's configuration and instrumentation conventions (entry-point init module, `VITE_` config, no-op when absent, PII-free payloads) are established there.
- Depends on **WEB-003**: the analytics project, client configuration shape (`lib/analytics.ts`, `readAnalyticsConfig()` / `initAnalytics()` / `captureEvent()`), and the user identification hook are established there and are the counterpart that closes the link in R006.

## Effort rationale

10 functional requirements (6–12 band), 3 NFRs present, 5 edge cases, and two dependencies (LANDING-002 and WEB-003) whose artifacts must both be reused. The identity-continuity requirement (R005/R006, NF003, EC001) spans two separate deployments, so the feature is not contained within `apps/landing` alone, and the per-user idempotency guarantee (R008/EC004) adds state that must survive across visits. Multiple dependencies plus cross-deployment scope place this at: **high**.
