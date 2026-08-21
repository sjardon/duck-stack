# Infrastructure

Living document describing the DigitalOcean App Platform and Cloudflare Pages deploy topology for duck-stack. Updated when infrastructure components are added or modified.

---

## DigitalOcean App Platform

The `services` backend deploys to DigitalOcean App Platform (INFRA-008), not AWS. A single versioned specification, `.do/app.yaml`, declares one `service` component built from `apps/services/Dockerfile` with the monorepo root as Docker build context. Every environment-dependent value — app name, GitHub branch, and the 23 runtime environment variables the backend reads — is an `${VAR}` placeholder; the same specification structure serves every environment. Secret-classified variables (database connection string, Clerk keys, Mobbex credentials) are declared `type: secret`; their real values live only in a local, git-ignored `.do/.env.deploy.<environment>` file, never in the repository.

The platform HTTP port, the health-check port, and the container's `PORT` variable all resolve from the same `${PORT}` placeholder, so they cannot diverge; the health check probes the backend's existing `GET /health` endpoint.

Deploys are manual and repeatable: `.do/deploy.sh <values-file>` renders `.do/app.yaml` with `envsubst` and reconciles the application with `doctl apps create --spec <rendered> --upsert --wait`, which creates the app on the first run and updates it in place (keyed by the `name` field) on every later run, printing the resulting public HTTPS URL. `.do/README.md` documents the full procedure, including that console edits are overwritten by the next run and the command to scale the app down (it does not scale to zero). Automatic deploy on push/merge and rollback are driven by GitHub Actions calling this same script (INFRA-012, see "CI/CD Pipeline — GitHub Actions" below).

## Cloudflare Pages

`web` and `landing` each deploy to their own Cloudflare Pages project (INFRA-009), not AWS. `.cloudflare/deploy.sh <web|landing> <values-file>` is the single build-and-publish entry point for both apps — it is never triggered by Cloudflare's Git integration or a git hook; automatic deploy-on-push is instead driven by GitHub Actions calling this same script (INFRA-012, see "CI/CD Pipeline — GitHub Actions" below).

The script sources the given values file, builds the target app from the monorepo root (`pnpm install --frozen-lockfile && pnpm --filter <app> build`) so `workspace:*` dependencies resolve, writes `apps/<app>/dist/_redirects` (`/* /index.html 200`) for SPA-fallback routing, idempotently ensures the Pages project exists (`wrangler pages project create`), and uploads exactly `apps/<app>/dist` with `wrangler pages deploy --project-name <name> --branch <branch>`. `wrangler` is a pinned root `devDependency`, invoked via `pnpm exec wrangler`.

Cloudflare Pages distinguishes a production deployment (branch matches the project's production branch) from a preview deployment (any other branch), each with its own public `*.pages.dev` URL — so one project per app covers every environment, with only the sourced values file differing per environment. Build-time `VITE_*` variables are exported into the shell before the build so Vite inlines them into `import.meta.env`; only public-classified values are ever declared in the example values files (`.cloudflare/.env.deploy.web.example`, `.cloudflare/.env.deploy.landing.example`) — never a secret credential. `.cloudflare/README.md` documents the procedure, the secret-value restriction, the `CORS_ORIGIN` multi-origin format the backend expects, and a "Current deployments" table recording each app's public URL per environment.

## Better Stack — availability monitoring and log aggregation

Better Stack is the external provider (INFRA-011) for both backend availability monitoring and log retention/search, wired entirely through `.do/`, with no Terraform and no AWS resource.

**Log forwarding**: `.do/app.yaml`'s `services[0]` component declares a `log_destinations` entry using DigitalOcean App Platform's native `logtail` destination type, pointed at Better Stack via `${BETTERSTACK_LOGS_TOKEN}`. Every stdout/stderr line the container writes — the backend's structured JSON and the platform's own build/deploy/lifecycle output — is shipped outside the request path, so a Better Stack outage never degrades `GET /health` or request handling. Better Stack auto-indexes the backend's JSON fields (`timestamp`, `level`, `message`, `requestId`, `userId`, `duration`) as individually filterable fields.

**Availability monitoring**: `.do/monitoring/monitor.json` is a versioned Better Stack Uptime `status` monitor template (target URL, check frequency, request timeout as placeholders). `.do/monitoring/deploy.sh` renders it with `envsubst` and idempotently reconciles it against the Better Stack Uptime REST API (find-by-URL, then `PATCH` or `POST`), mirroring the upsert idiom `.do/deploy.sh` uses for the app spec, and invites the environment's alert recipient (`BETTERSTACK_ALERT_EMAIL`) into that environment's Better Stack team (scoped by `BETTERSTACK_API_TOKEN`). Better Stack's native down/recovery emails carry the checked URL, failure reason, and outage duration.

Every environment-dependent or credential value (`BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_API_TOKEN`, `BETTERSTACK_ALERT_EMAIL`, `BETTERSTACK_MONITOR_URL`, `BETTERSTACK_CHECK_FREQUENCY_SECONDS`, `BETTERSTACK_CHECK_TIMEOUT_SECONDS`) is a placeholder resolved from the same `.do/.env.deploy.<environment>` file `.do/app.yaml` already uses. `.do/monitoring/README.md` documents setup prerequisites, the deploy procedure, and known limits: `GET /health` does not check the database (a DB-only outage is not detected), an outage shorter than the probe interval can go undetected, the Logs destination has an ingestion quota whose no-code-change mitigation is raising `LOG_LEVEL` and redeploying, and an environment is not considered monitored until an end-to-end delivery test has been performed.

## CI/CD Pipeline — GitHub Actions

GitHub Actions (INFRA-012) is the only CI/CD provider; there is no second one. A merge to `develop` deploys `services`, `web`, and `landing` to the `dev` environment, and a merge to `main` deploys them to `prod`, with no manual step. Every trigger — the two automatic ones plus two `workflow_dispatch` flows (`deploy-manual.yml` for an arbitrary commit, `rollback.yml` for redeploying a previously delivered one) — calls one reusable workflow, `deploy-apps.yml`, which is the only place that invokes `.do/deploy.sh` and `.cloudflare/deploy.sh`; those two scripts (INFRA-008, INFRA-009) are never duplicated or rewritten.

Two GitHub Environments, `dev` and `prod`, are the single per-environment configuration source, split into non-secret `vars.*` and encrypted `secrets.*` exactly like `.do/app.yaml` already splits `type: general` from `type: secret`. The reusable workflow's job sets `environment: ${{ inputs.environment }}`, so the same workflow definition serves both environments with no environment-name branching in its body; no credential is ever committed to the repository.

DigitalOcean App Platform's `github` source only accepts a branch, never a commit SHA. To pin a deploy to an exact commit (required for the manual and rollback flows, and to make an automatic deploy immune to a second commit landing before DigitalOcean fetches), the pipeline force-updates a per-environment ref (`_deploy/dev`, `_deploy/prod`) to the target commit immediately before every `.do/deploy.sh` invocation, and `.do/app.yaml`'s `${GIT_BRANCH}` placeholder points at that ref. No branch-protection rule may match `_deploy/*` without explicitly allowing the workflow's token to force-push it.

The backend's `SERVICE_VERSION` and both SPAs' `VITE_RELEASE` are always the exact commit SHA being deployed, so the release a running app reports and the release its uploaded source maps are identified by are structurally the same value; `apps/landing/vite.config.ts` now aborts its build on a failed source-map upload, matching `apps/web/vite.config.ts`.

Each deploy run executes the three app deploys as sequential `continue-on-error` steps in one job followed by an unconditional reporting step: the run only concludes once all three apps have reached a terminal state, it prints per app the target environment, exact commit, and public URL, and it fails whenever any app did not publish — a partial delivery is never reported as a success. All four trigger workflows share one `concurrency` group per environment (`cancel-in-progress: false`), so a deploy run targeting an environment that starts while another one is in progress is queued and executed afterward rather than cancelled.

`.github/README.md` documents the full `vars`/`secrets` contract per environment, the `_deploy/<environment>` ref mechanism, the concurrency behavior, the rollback data-caveat (application code only — already-applied data changes are not reverted), and the partial-failure recovery procedure (re-run the manual deploy flow with the same commit, or the rollback flow with the previous one; no automatic compensation is attempted). `.do/README.md` and `.cloudflare/README.md` cross-reference it.

## Not managed here

- **Database**: Supabase (external PostgreSQL). No RDS provisioned.
- **Custom domains / SSL**: deferred to a future feature.
