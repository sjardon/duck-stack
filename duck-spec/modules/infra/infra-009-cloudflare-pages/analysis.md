# INFRA-009 — `web` and `landing` hosting on Cloudflare Pages — Analysis

## Reason for being

INFRA-003 defined static hosting for the two SPAs on private S3 buckets fronted by CloudFront (OAC-signed requests, 403/404 rewritten to `/index.html`), but that Terraform was never applied — like the rest of the AWS infrastructure. With the exit from AWS already decided and the backend already running on DigitalOcean App Platform (INFRA-008), `web` and `landing` are left without a deploy target.

Both applications are plain Vite static builds (`vite build`) that live inside the pnpm workspace and depend on workspace packages (`@repo/types`, `@repo/tsconfig`, `@repo/eslint-config` declared as `workspace:*`), so their build cannot be executed in isolation from each app's directory — the dependency graph only resolves from the monorepo root.

The goal is to serve `web` and `landing` as static SPAs from Cloudflare Pages, with client-side routing working on direct navigation and reload, and the build resolved from the monorepo.

## Scope

One Cloudflare Pages project per application, each building the corresponding Vite app from the monorepo root with pnpm and publishing its `dist/` output over public HTTPS. It also covers the SPA fallback so that any path not matching a static asset returns the application's root document, the per-environment build-time configuration variables each SPA reads from `import.meta.env`, and making the resulting public URLs available so the backend's allowed origins can be configured against them.

## Out of scope

- Automatic deployment on merge (INFRA-012).
- Removal of the S3 and CloudFront Terraform (INFRA-010).
- Custom domains and certificates.
- Custom cache rules, WAF and geographic restrictions.
- Any change to the source code of `apps/web` and `apps/landing`.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall host each SPA (`apps/web`, `apps/landing`) in its own independent static hosting project, so that the configuration, build and public URL of one application are not shared with the other. |
| R002 | Event-driven | WHEN a deployment of a SPA completes successfully, the system shall serve that SPA's built content publicly over HTTPS at a reachable URL, without further manual configuration. |
| R003 | Ubiquitous | The system shall build each SPA by executing the build from the monorepo root with pnpm, so that the `workspace:*` dependencies (`@repo/types`, `@repo/tsconfig`, `@repo/eslint-config`) resolve and the build produces the app's static output. |
| R004 | Ubiquitous | The system shall publish, for each project, exactly the static output directory produced by that app's Vite build (`apps/<app>/dist`), and no other directory of the monorepo. |
| R005 | Event-driven | WHEN a request targets a path that does not match a static file in the published output, the system shall respond with HTTP 200 and the SPA's root document (`index.html`), so the client-side router resolves the navigation. |
| R006 | Ubiquitous | The system shall inject at build time the configuration variables each SPA reads from `import.meta.env` — `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_LANDING_URL` and `VITE_PROVIDER_PORTAL_URL` for `web`; `VITE_API_URL` and `VITE_WEB_URL` for `landing` — so the bundle is produced with resolved values instead of `undefined`. |
| R007 | Ubiquitous | The system shall allow each build-time variable to hold a different value per environment without duplicating or forking the project configuration. |
| R008 | Event-driven | WHEN a SPA is deployed, the system shall record its resulting public URL in the repository documentation, per environment, so the backend's allowed origins (`CORS_ORIGIN`) and the cross-app link variables can be configured against it. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | Starting from a clean clone of the repository, each SPA's build shall complete with the single configured build command, with no prior manual step and no dependency installed outside the monorepo lockfile. |
| NF002 | No sensitive value shall be embedded in the published bundle: an inspection of the deployed assets shall find no secret key, API credential, signing secret or database connection string. |
| NF003 | Each SPA's content shall be served from the provider's distribution network, with no separately reachable origin host: a request to any address other than the project's public URL shall not return the SPA's content. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the build is configured with the app directory as its root (for example root directory `apps/web` and build command `pnpm build`), the workspace packages declared as `workspace:*` do not resolve and the build fails; the system shall configure the repository root as the build root and a build command that installs from the root lockfile and builds the target app through the workspace (for example `pnpm install --frozen-lockfile && pnpm --filter <app> build`), so the build completes and emits `apps/<app>/dist/index.html`. |
| EC002 | WHEN a build-time variable is configured for a project, its value is inlined into the published bundle and is readable by anyone downloading the assets; the system shall configure only public-classified values in each project (`VITE_API_URL`, the Clerk **publishable** key, and the cross-app public URLs) and shall not configure any secret-classified variable (Clerk secret key, webhook signing secrets, Mobbex credentials, `DATABASE_URL`) in the hosting projects. The deploy documentation shall state this restriction explicitly. |
| EC003 | WHEN a user reloads the browser on a deep route (for example `/billing/subscribe`) and no SPA fallback is configured, the request returns HTTP 404 because no such file exists in the output; the system shall configure a catch-all fallback that returns `index.html` with HTTP 200 for every non-asset path, so the same reload renders the application and the client router resolves the route. |
| EC004 | WHEN a browser loads a SPA from its public URL and that URL is not present in the backend's `CORS_ORIGIN` for the same environment, the API response carries no matching `Access-Control-Allow-Origin` header and every request from the SPA fails; the system shall record both SPA public URLs per environment and set the backend's `CORS_ORIGIN` value for that environment to include them, so requests from either SPA receive a matching `Access-Control-Allow-Origin`. Assumption: `serverConfig.corsOrigin` currently forwards `CORS_ORIGIN` verbatim as a single string to `@fastify/cors`, so a comma-joined value would match neither origin; the design must resolve how a multi-origin value is expressed (at minimum, documenting the exact accepted format per environment). |
| EC005 | WHEN a SPA is deployed to more than one environment, each environment is served from a distinct public URL (production project URL vs. per-branch preview URL); the system shall document, for every environment, its own pair of SPA URLs and the corresponding `CORS_ORIGIN` value in that environment's backend deploy values file, so no environment is left with an origin list that only covers a different environment. |

## Technical constraints

- Static hosting: Cloudflare Pages, one project per application (`web`, `landing`).
- Build executed from the monorepo root with pnpm; the project's root directory setting must be the repository root, not the app directory.
- The SPA fallback must be expressed through a mechanism supported by the platform for static asset serving (for example a `_redirects` entry `/* /index.html 200` shipped in the build output).
- No changes to `apps/web` and `apps/landing` source code: the hosting configuration must adapt to the existing Vite setup (`vite build`, default `dist` output, `import.meta.env.VITE_*` variables), not the other way around.
- No Terraform: the AWS `static_site` module remains versioned but is not the source of truth for this hosting and is removed by INFRA-010.

## Dependencies

- A Cloudflare account with Pages enabled and the repository connected (or an equivalent upload path) before the first deploy.
- The public backend URL produced by INFRA-008 must exist to populate `VITE_API_URL`; conversely the backend's `CORS_ORIGIN` cannot be finalized until this feature yields the SPA URLs — the two configurations close in a second pass.
- The Clerk publishable key for each environment must be available, since `apps/web/src/main.tsx` throws before rendering when `VITE_CLERK_PUBLISHABLE_KEY` is absent.

## Effort estimate

**high** — 8 functional requirements covering two independent hosting projects, a monorepo-aware build, SPA fallback, per-environment build-time variables and URL propagation; three non-functional requirements including a security guarantee about the publicly downloadable bundle; five edge cases spanning build-root failure, secret leakage through inlined variables, deep-link 404, cross-origin rejection and multi-environment URL fan-out; plus a bidirectional dependency with the backend deployment (INFRA-008) for the API URL and CORS configuration.
