# CI/CD pipeline (INFRA-012)

This directory holds the GitHub Actions workflows that automate the deploy
of the three apps — `services` (DigitalOcean App Platform), `web` and
`landing` (Cloudflare Pages) — reusing the existing `.do/deploy.sh` and
`.cloudflare/deploy.sh` entry points documented in `.do/README.md` and
`.cloudflare/README.md`. A manual local deploy and a pipeline deploy stay
equivalent: every trigger funnels through the same reusable workflow, which
calls those two scripts unmodified.

## Triggers

| Workflow | Trigger | Target environment |
|---|---|---|
| `deploy-dev.yml` | `push` to `develop` | `dev` — no manual step |
| `deploy-prod.yml` | `push` to `main` | `prod` — no manual step |
| `deploy-manual.yml` | `workflow_dispatch` with `environment` and `commit_sha` inputs | the chosen environment, at the chosen commit |
| `rollback.yml` | `workflow_dispatch` with `environment` and `commit_sha` inputs | the chosen environment, redeployed to the chosen previously-delivered commit |

All four workflows call the same reusable `deploy-apps.yml` (`workflow_call`)
workflow — the only place that deploys anything. Its steps: checkout at the
given `commit_sha`, resolve configuration for the given `environment`, pin
the DigitalOcean deploy ref, then run the three deploy scripts.

## Per-environment configuration contract (GitHub Environments)

Two GitHub Environments, `dev` and `prod`, are the single per-environment
source that feeds all three app deploys — no value is duplicated per app and
no value is hardcoded in a workflow file. Every value/credential the three
deploys need is read at run time from the selected GitHub Environment's
`vars.*`/`secrets.*`, with no `if environment == 'prod'`/`'dev'` branching
anywhere in the workflow body.

### `vars.*` (non-secret)

`DO_APP_NAME`, `NODE_ENV`, `LOG_LEVEL`, `HOST`, `PORT`, `CORS_ORIGIN`,
`EMAIL_SENDER_ADDRESS`, `BILLING_PROVIDER`, `MOBBEX_TEST_MODE`,
`MOBBEX_TIMEOUT_MS`, `ERROR_TRACKING_SAMPLE_RATE`, `SIGNUP_MODE`,
`FREE_TRIAL_DAYS`, `STRICT_ENTITLEMENTS_ON_PAST_DUE`, `GIT_BRANCH` (the
Cloudflare classification label only — `develop` for `dev`, `main` for
`prod`), `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_LANDING_URL`,
`VITE_PROVIDER_PORTAL_URL`, `VITE_WEB_URL`, `VITE_ENVIRONMENT`,
`VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_ERROR_TRACKING_DSN`,
`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`.

### `secrets.*`

`DIGITALOCEAN_ACCESS_TOKEN`, `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `RESEND_API_KEY`,
`MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_WEBHOOK_SECRET`,
`ERROR_TRACKING_DSN`, `BETTERSTACK_LOGS_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, `SENTRY_AUTH_TOKEN`.

No secret required to deploy is ever committed to the repository: every one
of the values above is read at run time from GitHub's encrypted
per-environment secret storage, never written to a repository file — an
inspection of the repository at any commit finds no DigitalOcean token,
Cloudflare account ID or API token, error-tracking auth token, database
connection string, Clerk key or Mobbex credential.

`CLOUDFLARE_PROJECT_NAME` is intentionally not an Environment value — one
Cloudflare Pages project already covers every environment per app, so
`.cloudflare/deploy.sh`'s own default (`duck-stack-$APP`) applies uniformly.
`GITHUB_REPO` is computed from `${{ github.repository }}`, and
`SERVICE_VERSION`/`VITE_RELEASE` are always set to the exact commit SHA
being deployed at run time — never a stored value.

## Pinning DigitalOcean's branch-based source to an exact commit

DigitalOcean's App Spec `github` source only accepts a branch name, never a
commit SHA. `.github/scripts/pin-do-deploy-ref.sh <environment> <commit_sha>`
force-pushes the target commit to `refs/heads/_deploy/<environment>` on
`origin` (creating the ref on its first use) immediately before every
`services` deploy, and `.do/app.yaml`'s `GIT_BRANCH` placeholder is set to
that ref name — never to `develop`/`main` directly — so the delivered
backend code is pinned to the exact commit being shipped, for both the
automatic and the manual/rollback flows.

**Operational caveat:** no branch-protection rule may match `_deploy/*` (or
it must explicitly allow the workflow's token to force-push it), otherwise
the pipeline's force-push to that ref will be rejected.

## Concurrency: holds instead of cancelling

Each of the four entry-point workflows sets, on the job that calls
`deploy-apps.yml`, a `concurrency` group named `deploy-<environment>` with
`cancel-in-progress: false`. A run in progress is never cancelled by a newer
one targeting the same environment; instead, GitHub Actions queues and holds
the newest pending run and executes it in full once the in-progress one
finishes. When two merges land on the same branch in quick succession, the
first runs, the second waits and then runs — the environment ends up serving
the commit of the run that was queued last, never the earlier one.

## Run output: environment, commit and public URL

Every deploy run prints, for each of the three apps, the target environment
and the exact commit SHA being delivered, together with the resulting public
URL reported by the provider (`.github/scripts/report-deploy-summary.sh`'s
final, unconditional (`if: always()`) step).

## Partial-delivery failure and recovery

If the deploy of one app fails, the run terminates with a failed conclusion,
and its output states, for each of the three apps, whether it was published
and at which commit — a partial delivery is never reported as a success.
When the backend and the SPAs are deployed in the same run and one of them
fails after another has already published, the environment is left with the
API and the frontend on different versions. No automatic compensation is
attempted; recovering from a partial delivery is done by re-running the
manual deploy flow (`deploy-manual.yml`) with the same commit, or the
rollback flow (`rollback.yml`) with the previous one.

## Rollback and the data-change caveat

`rollback.yml` prints an explicit warning before deploying:

> Rolling back services to `<commit_sha>` only reverts application code.
> Already-applied data changes are NOT reverted. Verify this version's
> compatibility with the current database state before confirming the
> rollback as complete.

Only application code is reverted; schema migrations and any other
already-applied data change remain out of this feature's scope. The
operator is responsible for verifying compatibility before confirming the
rollback is complete.

## The run waits for all three apps

The three deploy steps run sequentially, in one job, not in three parallel
jobs — the job (and therefore the run's conclusion) cannot resolve until all
three have reached a terminal state. The `services` step already blocks on
`doctl apps create --upsert --wait` until the platform finishes, so even
though the two SPA deploys are typically much faster, the run's completion
is never reported before the backend's deployment does.

## Adding a new configuration value

Console edits made directly on either provider are not preserved: the next
deploy overwrites them with the versioned specification plus the
CI-provided values. Any new environment-dependent value must be added to
`.do/app.yaml` (or the SPA values contract documented in
`.cloudflare/README.md`) **and** to the environment's CI configuration (the
`vars.*`/`secrets.*` contract documented above) before the next deploy —
`.github/scripts/write-values-file.sh`'s `services` manifest derives itself
automatically from `app.yaml`'s placeholders, so only the CI-configuration
half needs a manual step.

## See also

- `.do/README.md` — the manual backend deploy procedure `deploy-apps.yml`
  invokes unchanged.
- `.cloudflare/README.md` — the manual SPA deploy procedure `deploy-apps.yml`
  invokes unchanged.
