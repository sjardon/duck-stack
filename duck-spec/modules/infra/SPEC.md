# infra — Living Specification

Módulo de infraestructura y tooling. Cubre la configuración base del monorepo, pipelines de build, y paquetes compartidos de configuración y schemas.

---

## Monorepo Scaffolding (INFRA-001)

The repository is a pnpm + Turborepo monorepo. All workspaces are declared under two top-level directories: `apps/` for application packages and `packages/` for shared tooling and domain packages.

### Applications

| App | Stack | Dev script |
|-----|-------|------------|
| `apps/web` | Vite + React + TypeScript | `vite` |
| `apps/landing` | Vite + React + TypeScript | `vite` |
| `apps/services` | Fastify + TypeScript | `tsx watch src/index.ts` |

Each application is runnable independently via `pnpm dev` from its own workspace directory.

`apps/services` exposes a single GET `/health` route that returns `{ "status": "ok" }`.

### Shared packages

| Package | Name | Purpose |
|---------|------|---------|
| `packages/tsconfig` | `@repo/tsconfig` | Base TypeScript configuration (`base.json`) extended by all workspaces. Enables `strict`, `ESNext` target, `Bundler` module resolution, and declaration map emission. |
| `packages/eslint-config` | `@repo/eslint-config` | Shared ESLint rules (CommonJS) with TypeScript support. Consumed via `require("@repo/eslint-config")` in each workspace's `.eslintrc.cjs`. |
| `packages/types` | `@repo/types` | Pure TypeScript domain interfaces shared across apps. Has zero runtime dependencies; the `types` field in its `package.json` points directly at `src/index.ts`. |

### Turborepo pipeline

The root `turbo.json` defines three pipeline tasks:

| Task | dependsOn | cache | Notes |
|------|-----------|-------|-------|
| `build` | `["^build"]` | yes | Compiles all apps in dependency order (packages before apps). |
| `dev` | — | no | Persistent; all dev servers start in parallel. A single app failure does not abort others. |
| `lint` | — | yes | Runs ESLint across all workspaces. |

Running `pnpm build` from the repository root compiles every workspace in correct dependency order via Turborepo's `^build` dependency resolution.

### TypeScript configuration

All workspaces extend `@repo/tsconfig/base.json`, which sets `"strict": true`. `apps/services` overrides `module` and `moduleResolution` to `NodeNext` for Node.js compatibility. Frontend apps use `Bundler` resolution (inherited from base).

### Workspace dependency resolution

Each app declares workspace dependencies using the `workspace:*` protocol in `package.json`. pnpm resolves these to live symlinks, ensuring shared package changes are reflected without reinstallation.

---

## Backend Deployment — DigitalOcean App Platform (INFRA-008)

The `services` backend deploys to DigitalOcean App Platform from a single versioned application specification at `.do/app.yaml`; no infrastructure-as-code tool is involved. The specification declares exactly one `service` component built from `apps/services/Dockerfile` with the monorepo root as Docker build context (`source_dir: /`), so the Dockerfile's root-relative `COPY` instructions of `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and the shared packages' `package.json` files resolve during the platform build.

### Templated specification, one file per structure

Every value that differs per environment or must never be committed — the app name, the GitHub branch, and the 19 runtime environment variables the backend reads — is expressed as an `${VAR}` placeholder in `.do/app.yaml` rather than a literal. A single specification structure serves every environment; no per-environment fork exists. Secret-classified variables (`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_WEBHOOK_SECRET`) are declared `type: secret`; the rest are `type: general`. All variables are `scope: RUN_TIME`. `SES_REGION` carries an inline comment marking it as an inert placeholder pending migration off SES.

### Port and health check alignment

The platform HTTP port (`http_port`), the health check port (`health_check.port`), and the container's `PORT` environment variable all resolve from the same `${PORT}` placeholder at render time, so the platform port and the port the process binds can never diverge. The health check probes `GET /health`, the endpoint already exposed by the backend.

### Deploy procedure

An operator copies `.do/.env.deploy.example` to a git-ignored `.do/.env.deploy.<environment>` file, fills in the real (including secret) values, and runs `.do/deploy.sh .do/.env.deploy.<environment>`. The script validates every placeholder is non-empty before making any network call, renders `.do/app.yaml` with `envsubst`, and reconciles the application with `doctl apps create --spec <rendered> --upsert --wait`, which creates the app on the first run and updates it in place — keyed by the `name` field — on every later run. The command prints the app ID and the resulting public HTTPS URL (`DefaultIngress`), which the operator records in the "Current deployments" table in `.do/README.md` for the rest of the system to consume.

The versioned specification is the single source of truth: re-running the deploy procedure overwrites any configuration change made by hand in the DigitalOcean console. The service does not scale to zero; `.do/README.md` documents `doctl apps delete <app-id>` to stop it from consuming budget. `.do/README.md` also documents the exact startup-abort error (`Missing required env var: EMAIL_SENDER_ADDRESS`) as a missing-configuration failure rather than a platform failure.

### What is out of scope here

Hosting for `web` and `landing` is unrelated to this deployment (INFRA-009). Automatic deploy on merge, manual deploy of an arbitrary commit, and rollback are now covered by INFRA-012, which drives this same `.do/deploy.sh` entry point from GitHub Actions without modifying it.

### Files

`.do/app.yaml`, `.do/deploy.sh`, `.do/.env.deploy.example`, `.do/README.md`, and acceptance test suites under `.do/tests/` (`app-spec.test.sh`, `deploy-script.test.sh`, `env-example.test.sh`, `gitignore.test.sh`, `readme.test.sh`). `.gitignore` excludes `.do/.env.deploy.*` while keeping `.do/.env.deploy.example` tracked.

---

## Static Hosting — Cloudflare Pages (INFRA-009)

`web` and `landing` are each hosted as an independent Cloudflare Pages project, published through `.cloudflare/deploy.sh <web|landing> <values-file>` — never through Cloudflare's Git integration, so no deploy is ever triggered by a push. The script is the single build-and-publish entry point for both apps and mirrors the `.do/deploy.sh` pattern established by INFRA-008: a versioned script plus a git-ignored, per-environment values file.

### Build and publish

The script sources the given values file (`set -a; source <values-file>; set +a`), builds the target app from the monorepo root with `pnpm install --frozen-lockfile && pnpm --filter <app> build` so the `workspace:*` packages resolve, writes `apps/<app>/dist/_redirects` (`/* /index.html 200`) into the freshly built output for SPA-fallback routing, idempotently ensures the Cloudflare Pages project exists (`wrangler pages project create`, tolerating "already exists"), and uploads exactly `apps/<app>/dist` with `wrangler pages deploy --project-name <name> --branch <branch>`. `wrangler` is a pinned root `devDependency`, invoked via `pnpm exec wrangler`. The whole procedure — install, build, fallback file, deploy — is this single script invocation, with no prior manual step and no dependency outside `pnpm-lock.yaml`. The script parses and prints the resulting public `https://*.pages.dev` URL, which the operator records in `.cloudflare/README.md`'s "Current deployments" table; serving is exclusively through Cloudflare's own distribution network, with no separate origin host stood up.

### One project per app, every environment covered

Cloudflare Pages natively distinguishes a production deployment (branch matches the project's configured production branch) from a preview deployment (any other branch), each with its own public `*.pages.dev` URL. One Pages project per app therefore covers every environment — no per-environment project fork exists, and the deploy script never branches on environment; only the sourced values file differs.

### Build-time configuration

Each app's `VITE_*` variables are exported into the shell before the build runs, so Vite inlines them into `import.meta.env` ahead of any `.env` file: `web` reads `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_LANDING_URL`, `VITE_PROVIDER_PORTAL_URL`; `landing` reads `VITE_API_URL`, `VITE_WEB_URL`. Only public-classified values are ever declared in `.cloudflare/.env.deploy.web.example` and `.cloudflare/.env.deploy.landing.example` — no secret-classified variable (Clerk secret key, webhook signing secrets, Mobbex credentials, `DATABASE_URL`) is ever present in a Cloudflare Pages project.

### Backend CORS for multiple SPA origins

`apps/services/src/shared/configs/serverConfig.ts` splits a comma-separated `CORS_ORIGIN` into a trimmed `string[]`; a single value (including the `'*'` default) stays a plain string, unchanged from prior behavior. `@fastify/cors` matches a `string[]` against the request's `Origin` header element-by-element, so both SPA origins can be allowed from one `CORS_ORIGIN` value per environment. `.do/.env.deploy.example`'s `CORS_ORIGIN` comment documents the accepted format: a comma-separated list of full origins, no trailing slash.

### What is out of scope here

Custom domains and certificates, and custom cache/WAF/geo rules are not covered. No source file of `apps/web` or `apps/landing` was changed. Automatic deployment on merge is now covered by INFRA-012, which drives this same `.cloudflare/deploy.sh` entry point from GitHub Actions without modifying it.

### Files

`.cloudflare/deploy.sh`, `.cloudflare/.env.deploy.web.example`, `.cloudflare/.env.deploy.landing.example`, `.cloudflare/README.md` (includes the "Current deployments" URL table), and acceptance test suites under `.cloudflare/tests/` (`deploy-script.test.sh`, `env-example.test.sh`, `gitignore.test.sh`, `readme.test.sh`). `.gitignore` excludes `.cloudflare/.env.deploy.*` while keeping both `*.example` files tracked. `package.json` (root) declares `wrangler` as a pinned devDependency.

---

## Availability Monitoring & Log Aggregation — Better Stack (INFRA-011)

The backend's public `GET /health` endpoint is probed externally by a Better Stack Uptime monitor, and every stdout line the backend writes on DigitalOcean App Platform is forwarded to Better Stack Logs — both configured through the existing `.do/app.yaml` + git-ignored values-file mechanism, with no change to any application source code.

### Log forwarding

`.do/app.yaml`'s `services[0]` component declares a `log_destinations` entry using DigitalOcean's native `logtail` destination type, pointed at Better Stack's Logtail ingestion endpoint via `${BETTERSTACK_LOGS_TOKEN}`. The platform ships every stdout/stderr line — the backend's structured JSON and the platform's own build/deploy/lifecycle lines — to this destination outside the request path, so a destination outage never degrades `GET /health` or request handling. Better Stack's Logs source auto-parses the backend's JSON lines and indexes `timestamp`, `level`, `message`, `requestId`, `userId`, `duration` as individually filterable fields, distinct from the platform's plain-text lines. No secret or PII reaches the destination because the forwarded content is governed by the pre-existing Pino logging convention (`duck-spec/docs/BACKEND.md`); a one-time manual inspection of the forwarded stream per environment is a mandatory setup step, not a code guarantee.

### Availability monitoring

`.do/monitoring/monitor.json` is a versioned Better Stack Uptime `status` monitor template (target URL, check frequency, and request timeout as `${VAR}` placeholders). `.do/monitoring/deploy.sh` renders it with `envsubst` and idempotently reconciles it against the Better Stack Uptime REST API (find-by-URL, then `PATCH` or `POST`), mirroring the upsert idiom `.do/deploy.sh` already uses for the app spec. The same script invites the environment's alert recipient (`BETTERSTACK_ALERT_EMAIL`) as a team member of that environment's Better Stack team, scoped by `BETTERSTACK_API_TOKEN` — one team per environment, so the recipient is naturally per-environment with no on-call/escalation resource created. Better Stack's native down/recovery incident emails carry the checked URL, the failure reason, and the outage duration; no notification text is composed by this design.

### Per-environment configuration

Every environment-dependent or credential value (`BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_API_TOKEN`, `BETTERSTACK_ALERT_EMAIL`, `BETTERSTACK_MONITOR_URL`, `BETTERSTACK_CHECK_FREQUENCY_SECONDS`, `BETTERSTACK_CHECK_TIMEOUT_SECONDS`) is a placeholder resolved from the same `.do/.env.deploy.<environment>` file `.do/app.yaml` already uses — one template serves every environment, no fork, no secret committed.

### Known limits, recorded in `.do/monitoring/README.md`

`GET /health` does not check the database, so a DB-only outage is not detected (accepted blind spot). An outage shorter than the probe interval can go undetected. The chosen interval, its monthly request count, and the log query that excludes `/health` lines are recorded per environment, together with the Logs destination's ingestion quota and its no-code-change mitigation (raising `LOG_LEVEL` and redeploying). An environment is not considered monitored until an end-to-end delivery test (forced downtime/recovery notification) has been performed and confirmed.

### What is out of scope here

Backend exception reporting and grouping (SERVICES-011), a public status page, on-call schedules/escalation/alert silencing, alarms over business metrics or email delivery metrics, custom dashboards, and distributed tracing. No source file of `apps/services`, `apps/web`, or `apps/landing` was changed.

### Files

`.do/app.yaml` (extended with `log_destinations`), `.do/.env.deploy.example` (extended with the monitoring/log-forwarding section), `.do/monitoring/monitor.json`, `.do/monitoring/deploy.sh`, `.do/monitoring/README.md`, and acceptance test suites under `.do/monitoring/tests/` (`monitor-spec.test.sh`, `deploy-script.test.sh`, `readme.test.sh`). `.do/tests/app-spec.test.sh` and `.do/tests/env-example.test.sh` were extended to cover the new values. `.do/README.md` cross-references `.do/monitoring/README.md`.

---

## CI/CD Automation — GitHub Actions over DigitalOcean and Cloudflare (INFRA-012)

The three apps (`services`, `web`, `landing`) deploy automatically: a merge to `develop` delivers the merged commit to the `dev` environment, and a merge to `main` delivers it to `prod`, with no manual step. Every deploy — automatic or manual — funnels through one reusable GitHub Actions workflow (`.github/workflows/deploy-apps.yml`) that invokes the unchanged `.do/deploy.sh` and `.cloudflare/deploy.sh` entry points from INFRA-008/INFRA-009; no deploy mechanics were rewritten.

### Manual deploy and rollback

`workflow_dispatch` triggers cover two operator-initiated flows, both taking `environment` and `commit_sha` as inputs and both calling the same reusable workflow the automatic flows call: `deploy-manual.yml` delivers an arbitrary commit to a chosen environment, and `rollback.yml` redeploys a previously delivered commit, printing an explicit warning that only application code is reverted and that already-applied data changes are not — the operator must verify compatibility with the current database state before treating the rollback as complete.

### Pinning the backend deploy to an exact commit

DigitalOcean App Platform's `github` source only accepts a branch name, never a commit SHA, so every deploy — automatic or manual — force-updates a per-environment ref (`_deploy/dev`, `_deploy/prod`) to the exact commit being delivered immediately before invoking `.do/deploy.sh`, and points `.do/app.yaml`'s `${GIT_BRANCH}` placeholder at that ref. This makes the delivered backend commit exact regardless of what lands on `develop`/`main` afterward, and keeps `.do/app.yaml`'s structure, `envsubst` + `doctl --upsert` reconcile, and `${PORT}`-shared health-check wiring untouched.

### Per-environment configuration source

Two GitHub Environments, `dev` and `prod`, are the single per-environment source that feeds all three app deploys — every value the three deploy scripts need is either a non-secret Environment variable or an Environment secret, mirroring the `type: general`/`type: secret` split `.do/app.yaml` already encodes. The same workflow definition serves both environments with no `if environment == …` branching; the job's `environment:` input alone scopes which values resolve. No credential is ever committed: everything is read at run time from GitHub's encrypted per-environment secret storage.

### Release identifier and source-map alignment

The backend's `SERVICE_VERSION` and both SPAs' `VITE_RELEASE` are always set to the exact commit SHA being deployed, never a stored value, so the release a running app reports and the release its trace-resolution artifacts (source maps) are uploaded under are structurally identical. `apps/landing/vite.config.ts` now rethrows a failed source-map upload (matching `apps/web/vite.config.ts`), so a failed upload aborts the landing build and the deploy, instead of being silently swallowed.

### Run output and partial-failure visibility

Every deploy run prints, for each of the three apps, the target environment, the exact commit SHA delivered, and the resulting public URL. The three app deploys run as sequential `continue-on-error` steps in one job, followed by an unconditional reporting step: the run only concludes once all three have reached a terminal state, and it fails whenever any app did not publish — so a partial delivery (frontend and backend on different versions) is never reported as a success, and the run output alone shows which apps published and at which commit.

### Concurrency

All four trigger workflows (`deploy-dev.yml`, `deploy-prod.yml`, `deploy-manual.yml`, `rollback.yml`) share one `concurrency` group per environment with `cancel-in-progress: false`: a deploy run targeting an environment that starts while another one targeting the same environment is still in progress is queued, not cancelled, and runs to completion afterward serving the commit of the run queued last.

### What is out of scope here

Running tests and linting inside the pipeline, per-pull-request preview environments, deploy notifications to external channels, provisioning the provider accounts and projects, and database migrations as part of the deploy.

### Files

`.github/workflows/deploy-apps.yml`, `deploy-dev.yml`, `deploy-prod.yml`, `deploy-manual.yml`, `rollback.yml`; `.github/scripts/pin-do-deploy-ref.sh`, `write-values-file.sh`, `report-deploy-summary.sh`; `.github/README.md`; acceptance test suites under `.github/tests/` (`trigger-workflows.test.sh`, `deploy-apps-workflow.test.sh`, `pin-deploy-ref-script.test.sh`, `write-values-file-script.test.sh`, `report-deploy-summary-script.test.sh`, `readme.test.sh`). `apps/landing/vite.config.ts` gained the source-map-upload `errorHandler` override. `.do/README.md` and `.cloudflare/README.md` cross-reference `.github/README.md`.
