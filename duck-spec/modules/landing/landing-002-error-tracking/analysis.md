# LANDING-002 — Error tracking en `landing`

## Reason for being

WEB-002 made the errors of the product SPA visible: uncaught errors, unhandled rejections and render failures in `apps/web` are now reported to Better Stack with environment, release, and stack traces resolved back to the original sources. `apps/landing` was left uncovered. Its entry point mounts the marketing SPA with no error boundary anywhere in the tree, so a render error unmounts the React root and leaves a blank page — and the landing is the first impression someone has of the product: the visitor has no relationship with it yet, reports nothing, and simply leaves.

As in `web`, the published bundle is minified by the Vite production build, so any stack trace that did arrive unresolved would point at a hashed bundle offset and would be useless for diagnosis.

**Goal:** every error of the landing ends up reported, carrying stack traces that point at the original source code.

## Scope

The requirements cover automatic reporting of uncaught errors and unhandled promise rejections in `apps/landing`, resolution of the reported stack traces back to the original sources (source maps produced by the production build and published to the provider at deploy time), a React error boundary that replaces the blank page with a visible error screen, enrichment of every report with environment and deployed release, and making the whole instrumentation opt-in through public frontend configuration so its absence never prevents the landing from rendering. Reporting is strictly anonymous — the landing has no session and no visitor identity to attach.

## Out of scope

- Conversion analytics (LANDING-003)
- Attribution of reports to a user: the landing is anonymous
- Performance and SEO/positioning metrics
- Instrumentation of `apps/web` (WEB-002)

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN an uncaught error is raised anywhere in the landing runtime, the system shall report it automatically to the error tracking provider with its stack trace. |
| R002 | Event-driven | WHEN a promise is rejected and the rejection is not handled, the system shall report it automatically to the error tracking provider with its stack trace. |
| R003 | Ubiquitous | The system shall make reported stack traces resolve to the original source files and line numbers instead of the minified published bundle. |
| R004 | Event-driven | WHEN a component throws during render, the system shall catch the error in an error boundary, report it to the provider, and render an error screen to the visitor instead of leaving the page blank. |
| R005 | Ubiquitous | The system shall include the environment name and the deployed release version in every report sent to the provider. |
| R006 | Conditional | IF the error tracking configuration is present in the landing build, THEN the system shall initialize the reporting client before the landing renders and report according to R001–R005. |
| R007 | Conditional | IF the error tracking configuration is absent, THEN the system shall render and operate the landing normally with reporting disabled and without throwing at startup. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The artifacts that allow resolving stack traces (source maps) shall not be publicly retrievable next to the published bundle: requesting a `.map` URL from the deployed origin shall not return the map contents. |
| NF002 | Instrumentation shall not perceptibly delay the initial load of the landing: reporting client setup shall not block first render and shall not require a blocking network round-trip before the page is displayed. |
| NF003 | The system shall not transmit any data that identifies the visitor: no user identifier, no personal attribute, and no contents of fields the visitor fills in shall be included in any report payload. |
| NF004 | A failure, timeout, or unavailability of the error tracking provider shall not prevent the landing from loading, rendering, or being navigated. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a production deploy is performed and the source map publication step does not complete successfully, the system shall fail the deploy with a non-zero exit instead of publishing a release whose reports would arrive minified and undiagnosable. *(Assumption: FEATURES.md only states the risk of missing artifacts; the conservative behavior adopted — consistent with WEB-002/EC001 — is to treat map publication as a required, failing step of the release.)* |
| EC002 | WHEN source maps are published to the provider, the system shall associate them with the exact same release identifier that the published bundle reports (R005), so traces cannot resolve against a different build; IF the identifiers do not match, THEN the publication step shall fail rather than upload mismatched artifacts. |
| EC003 | WHEN a browser blocker prevents the report request from reaching the provider, the system shall swallow the transport failure: the landing shall continue rendering and navigating normally, the failure shall not surface as an uncaught error or unhandled rejection in the page, and no retry loop shall be issued for the blocked event. *(Assumption: FEATURES.md states blockers bias what is observed but prescribes no behavior; the conservative behavior adopted is that a blocked send is a silent no-op for the visitor — the bias in the collected sample is accepted, not compensated.)* |
| EC004 | WHEN the error boundary's own fallback would fail, the system shall still show the visitor a visible error surface: the fallback shall render only static markup plus a reload action, using no data fetching, no API stubs, and no provider-dependent state, so it has no failure path of its own. *(Assumption: FEATURES.md only states the risk; the conservative behavior adopted is a dependency-free fallback.)* |
| EC005 | WHEN the landing reads its error tracking configuration, the system shall use only values that are safe to embed in the publicly readable bundle (the provider ingest destination, environment name, release identifier), and shall not reference any credential required to publish source maps — that credential shall exist only in the build/deploy environment and shall never be readable from the published bundle. |

## Technical constraints

- Error tracking provider: **Better Stack**, compatible with the Sentry SDKs — same project/account conventions established by SERVICES-011, INFRA-011 and WEB-002.
- Instrumentation uses the **Sentry SDK for React**, pointed at the provider destination through configuration, so switching providers is a change of one variable.
- Configuration is read from Vite `VITE_`-prefixed environment variables (`import.meta.env`), following the frontend convention established by WEB-002 (`VITE_ERROR_TRACKING_DSN`, `VITE_ENVIRONMENT`, `VITE_RELEASE`). These values are embedded in the bundle and are public by definition; the source-map upload credential must never carry a `VITE_` prefix.
- Source maps are produced by the production build (`vite build`) and published to the provider as part of the deploy, not served from the static origin.
- The instrumentation must respect the `apps/landing` flat layer model: React-free bootstrap logic belongs in `lib/`, the error boundary and its fallback are components, and the client bootstrap belongs at the application entry point (`main.tsx`).
- `apps/landing` deliberately omits React Query, Zustand and `@repo/types`; this feature must not introduce any of them.
- No user attribution mechanism exists or may be added: the landing has no auth provider and must remain anonymous (NF003).
- Depends on **WEB-002**: the stack-trace resolution mechanism (build-time source map generation gated on a deploy-only credential, upload keyed by release, deletion from `dist` after upload) and the frontend configuration conventions are established there and must be reused rather than redesigned.

## Effort rationale

7 functional requirements (6–12 band), 4 NFRs present, 5 edge cases, and a single simple dependency (WEB-002, whose mechanism is already built and reusable). No new critical security/performance surface — NF001 mirrors a hardening pattern already solved in `web`. Therefore: **medium**.
