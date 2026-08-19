# `web` and `landing` hosting on Cloudflare Pages (INFRA-009)

This directory holds the deploy script and per-app values-file templates
used to build and publish the `apps/web` and `apps/landing` SPAs to
Cloudflare Pages. Deployment is always an explicit, local/CI invocation of
`.cloudflare/deploy.sh` — never triggered by a git push or a Cloudflare-side
build hook (automatic deploy-on-merge is out of scope, INFRA-012).

## Contents

| File | Purpose |
|---|---|
| `.cloudflare/deploy.sh` | Builds the given app from the repo root through the pnpm workspace, writes the SPA fallback, and deploys `apps/<app>/dist` via `wrangler pages deploy`. |
| `.cloudflare/.env.deploy.web.example` | Documents every placeholder `deploy.sh web` needs, with safe example values. |
| `.cloudflare/.env.deploy.landing.example` | Documents every placeholder `deploy.sh landing` needs, with safe example values. |
| `.cloudflare/.env.deploy.<app>.<environment>` | Per-environment real values. Git-ignored — never commit this file. |

## Prerequisites

- `wrangler`, Cloudflare's CLI, invoked as `pnpm exec wrangler` so it
  resolves from the workspace lockfile (it is a pinned root
  `devDependency`) instead of an ad hoc network fetch.
- A Cloudflare account with Pages enabled, and an API token with Pages edit
  permissions (`CLOUDFLARE_API_TOKEN`) plus the account's
  `CLOUDFLARE_ACCOUNT_ID`.

No other cloud resource needs to be provisioned: hosting is exclusively
Cloudflare's own `*.pages.dev` distribution — no separate origin host is
stood up.

## Deploy procedure

1. Copy the app's example values file to a per-app, per-environment file
   (never commit it):

   ```sh
   cp .cloudflare/.env.deploy.web.example .cloudflare/.env.deploy.web.<environment>
   cp .cloudflare/.env.deploy.landing.example .cloudflare/.env.deploy.landing.<environment>
   ```

2. Fill in the real values for that environment, including
   `CLOUDFLARE_API_TOKEN`, which is left blank in the example file.

   **Only public-classified values belong in these files** — the four
   `VITE_*` keys for `web` and the two `VITE_*` keys for `landing` are
   inlined into the published bundle and are readable by anyone who
   downloads it. Never add a secret-classified variable here (Clerk secret
   key, webhook signing secrets, Mobbex credentials, `DATABASE_URL`).

3. Run the deploy script with that file:

   ```sh
   .cloudflare/deploy.sh web .cloudflare/.env.deploy.web.<environment>
   .cloudflare/deploy.sh landing .cloudflare/.env.deploy.landing.<environment>
   ```

   `deploy.sh` validates every required variable is set, builds the app from
   the repo root with `pnpm install --frozen-lockfile && pnpm --filter <app>
   build` (so the `workspace:*` packages resolve), writes
   `apps/<app>/dist/_redirects` with `/* /index.html 200` so a deep-link
   reload still resolves through the client-side router, idempotently
   ensures the Cloudflare Pages project exists, and deploys exactly
   `apps/<app>/dist`. One Cloudflare Pages project per app covers every
   environment: Cloudflare classifies a deployment as production or preview
   by comparing the deployed `GIT_BRANCH` to the project's
   `PRODUCTION_BRANCH`, so every environment of the same app shares the same
   project and example file — only the values file's contents change.

4. When the command finishes, it prints the resulting public
   `https://*.pages.dev` URL. Record it in the "Current deployments" table
   below.

## Error tracking variables (WEB-002 `web`, LANDING-002 `landing`)

Both `web`'s and `landing`'s error tracking (Better Stack, via the Sentry SDK) are opt-in and controlled by two independent groups of variables:

- **Public, `VITE_*`-prefixed, belong in the values file:** `VITE_ERROR_TRACKING_DSN`, `VITE_RELEASE`, `VITE_ENVIRONMENT`. These are inlined into the published bundle. Leaving `VITE_ERROR_TRACKING_DSN` unset disables error tracking entirely — the application still renders and operates normally.
- **Deploy-time only, never `VITE_*`-prefixed, never inlined into the bundle:** `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`. These authenticate and target the source-map upload performed during `vite build`. `SENTRY_AUTH_TOKEN` gates whether source maps are produced at all — when it is unset, the build emits no `.map` files.

When `SENTRY_AUTH_TOKEN` is set, `vite build` uploads `dist/**/*.map` to the error tracking provider under the same `VITE_RELEASE` identifier the running application reports, then deletes the `.map` files from `dist` before this script's `wrangler pages deploy` step runs — source maps are never published alongside the bundle. If the upload fails, the plugin fails `vite build`, which aborts the deploy before anything is published. `landing` follows the identical mechanism as `web`, reusing the same `sentryVitePlugin` wiring and `VITE_RELEASE` single source of truth between build-time and runtime.

## Product analytics and feature flag variables (WEB-003 `web`)

`web`'s product analytics (screen views, named product events, session replay) and runtime feature flags are both provided by PostHog and are opt-in, controlled by two public `VITE_*` variables that belong in the values file:

- `VITE_POSTHOG_KEY` — the PostHog project API key. Leaving it unset disables analytics capture, session replay, and flag resolution entirely: the application still renders and operates normally, and every flag resolves to its safe (disabled) default.
- `VITE_POSTHOG_HOST` — the ingestion host. Defaults to `https://us.i.posthog.com` when unset.

No deploy-time-only variable is needed for this feature — unlike error tracking's source-map upload, PostHog has no build-time secret.

## Configuring the backend's `CORS_ORIGIN`

Both SPAs call the backend deployed under INFRA-008, so the backend's
`CORS_ORIGIN` for a given environment must include both apps' public URLs
for that same environment. `CORS_ORIGIN` accepts a **comma-separated list of
full origins, with no trailing slash**, for example:

```
CORS_ORIGIN=https://duck-stack-web.pages.dev,https://duck-stack-landing.pages.dev
```

A single-origin deployment may use one plain origin value.

**Each environment's `CORS_ORIGIN` must list only that environment's own
SPA URLs.** Do not reuse one environment's `web`/`landing` URLs in another
environment's `.do/.env.deploy.<environment>` file — a production
`CORS_ORIGIN` must never point at a preview URL, and vice versa.

## Current deployments

| App | Environment | Public URL | Last updated |
|---|---|---|---|
| | | | |
