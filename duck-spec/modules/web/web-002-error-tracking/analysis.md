# WEB-002 — Error tracking en `web`

## Reason for being

SERVICES-011 made backend exceptions visible: every unhandled error that reaches the Fastify error handler is now reported to Better Stack, correlated with its `requestId`, environment, and deployed version. But half of what a user actually suffers happens in the browser. `apps/web` currently reports nothing: `main.tsx` mounts `<ClerkProvider>` / `<QueryClientProvider>` / `<App>` with no error boundary anywhere in the tree, so a render error unmounts the React root and leaves a blank screen. The user reloads or leaves, and nobody ever finds out it happened.

On top of that, the published bundle is minified by the Vite production build. Any stack trace that did arrive unresolved would point at `index-<hash>.js:1:24817` and would be useless for diagnosis.

**Goal:** every error of the product SPA ends up reported, grouped, and carrying stack traces that point at the original source code.

## Scope

The requirements cover automatic reporting of uncaught errors and unhandled promise rejections in `apps/web`, resolution of the reported stack traces back to the original sources (source maps produced by the production build and published to the provider at deploy time), a React error boundary that replaces the blank screen with a visible error screen and reports the render failure, enrichment of every report with environment and deployed release, optional attribution to the authenticated user by identifier only, and making the whole instrumentation opt-in through public frontend configuration so its absence never prevents the application from running.

## Out of scope

- Session replay and product analytics (WEB-003)
- Frontend performance metrics
- Instrumentation of `apps/landing` (LANDING-002)
- Reporting of errors originated in the API, already covered by the backend (SERVICES-011)
- Translation or user-facing presentation of domain error messages

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN an uncaught error is raised anywhere in the SPA runtime, the system shall report it automatically to the error tracking provider with its stack trace. |
| R002 | Event-driven | WHEN a promise is rejected and the rejection is not handled, the system shall report it automatically to the error tracking provider with its stack trace. |
| R003 | Ubiquitous | The system shall make reported stack traces resolve to the original source files and line numbers instead of the minified published bundle. |
| R004 | Event-driven | WHEN a component throws during render, the system shall catch the error in an error boundary, report it to the provider, and render an error screen to the user instead of leaving the application blank. |
| R005 | Ubiquitous | The system shall include the environment name and the deployed release version in every report sent to the provider. |
| R006 | Conditional | IF a user is authenticated at the moment a report is produced, THEN the system shall attach that user's identifier to the report and shall not attach any other personal attribute (name, email, or profile data). |
| R007 | Conditional | IF the error tracking configuration is present in the frontend build, THEN the system shall initialize the reporting client before the application renders and report according to R001–R006. |
| R008 | Conditional | IF the error tracking configuration is absent, THEN the system shall render and operate the application normally with reporting disabled and without throwing at startup. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The artifacts that allow resolving stack traces (source maps) shall not be publicly retrievable next to the published bundle: requesting a `.map` URL from the deployed origin shall not return the map contents. |
| NF002 | Instrumentation shall not perceptibly delay the initial load of the application: reporting client setup shall not block first render and shall not require a blocking network round-trip before the application is interactive. |
| NF003 | The system shall not transmit personal user data nor the contents of forms the user fills in as part of any report payload. |
| NF004 | A failure, timeout, or unavailability of the error tracking provider shall not prevent the application from loading, rendering, or operating. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a production deploy is performed and the source map publication step does not complete successfully, the system shall fail the deploy with a non-zero exit instead of publishing a release whose reports would arrive minified and undiagnosable. *(Assumption: FEATURES.md only states the risk of missing artifacts; the conservative behavior adopted is to treat map publication as a required, failing step of the release.)* |
| EC002 | WHEN source maps are published to the provider, the system shall associate them with the exact same release identifier that the published bundle reports (R005), so traces cannot resolve against a different build; IF the identifiers do not match, THEN the publication step shall fail rather than upload mismatched artifacts. |
| EC003 | WHEN an error originates from a browser extension or a third-party script rather than from application code, the system shall discard the event before transmission so it does not create or inflate an issue in the provider. |
| EC004 | WHEN the error boundary's own fallback would fail, the system shall still show the user a visible error surface: the fallback shall render only static markup plus a reload action, using no data fetching, no domain hooks, and no provider-dependent state, so it has no failure path of its own. *(Assumption: FEATURES.md only states the risk; the conservative behavior adopted is a dependency-free fallback.)* |
| EC005 | WHEN an error occurs while no user is authenticated, the system shall send the report without a user identifier rather than discarding it. |
| EC006 | WHEN the frontend reads its error tracking configuration, the system shall use only values that are safe to embed in the publicly readable bundle (the provider ingest destination), and shall not reference any credential required to publish source maps — that credential shall exist only in the build/deploy environment. |

## Technical constraints

- Error tracking provider: **Better Stack**, compatible with the Sentry SDKs — same project/account conventions established by SERVICES-011 and INFRA-011.
- Instrumentation uses the **Sentry SDK for React**, pointed at the provider destination through configuration, so switching providers is a change of one variable.
- Configuration is read from Vite `VITE_`-prefixed environment variables (`import.meta.env`), consistent with the existing `VITE_CLERK_PUBLISHABLE_KEY` / `VITE_API_URL` convention. Unlike the backend (`errorTrackingConfig.ts` reading `ERROR_TRACKING_DSN` as a runtime secret), these values are embedded in the bundle and are public by definition.
- Source maps are produced by the production build (`vite build`) and published to the provider as part of the deploy, not served from the static origin.
- The instrumentation must respect the `apps/web` layered import rule (`api` → `hooks` → `pages` → `components`); the error boundary is a component and the client bootstrap belongs at the application entry point (`main.tsx`).
- User attribution must be derived from the existing Clerk session (`@clerk/clerk-react`), using the user identifier only.
- Depends on SERVICES-011: the error tracking project and the per-environment configuration/version conventions must already be established.
