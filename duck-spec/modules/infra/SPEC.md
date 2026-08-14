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

Automatic deploy on merge, manual deploy of an arbitrary commit, and rollback are not implemented (INFRA-012). Hosting for `web` and `landing` is unrelated to this deployment (INFRA-009).

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

Automatic deployment on merge (INFRA-012), custom domains and certificates, and custom cache/WAF/geo rules are not covered. No source file of `apps/web` or `apps/landing` was changed.

### Files

`.cloudflare/deploy.sh`, `.cloudflare/.env.deploy.web.example`, `.cloudflare/.env.deploy.landing.example`, `.cloudflare/README.md` (includes the "Current deployments" URL table), and acceptance test suites under `.cloudflare/tests/` (`deploy-script.test.sh`, `env-example.test.sh`, `gitignore.test.sh`, `readme.test.sh`). `.gitignore` excludes `.cloudflare/.env.deploy.*` while keeping both `*.example` files tracked. `package.json` (root) declares `wrangler` as a pinned devDependency.
