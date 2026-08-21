# INFRA-012 — CI/CD sobre DigitalOcean y Cloudflare — Analysis

## Reason for being

Since INFRA-010 retired the AWS stack, duck-stack has no deploy automation at all. Every delivery is executed by hand against two different providers: the backend through `.do/deploy.sh <values-file>` (renders `.do/app.yaml` with `envsubst` and reconciles the app with `doctl apps create --spec <rendered> --upsert --wait`), and each SPA through `.cloudflare/deploy.sh <web|landing> <values-file>` (installs from the monorepo root, builds the app, writes `_redirects`, ensures the Pages project and publishes `apps/<app>/dist` with `wrangler pages deploy`). `.do/app.yaml` explicitly sets `deploy_on_push: false` and Cloudflare's Git integration is deliberately unused, so nothing deploys on merge today. Both INFRA-008 and INFRA-009 recorded automatic deploy and rollback as INFRA-012's scope.

That manual gap was a deliberate decision: the features delivered in between kept adding environment variables, secrets and build steps — the backend now reads 23 runtime variables declared in `.do/app.yaml`, the SPAs inline build-time `VITE_*` values, and both SPAs upload their source maps to the error-tracking provider during the production build (`@sentry/vite-plugin`, gated on `SENTRY_AUTH_TOKEN`, released under `VITE_RELEASE`). With that inventory complete and stable, the pipeline can be built once instead of being reworked on every feature.

The goal is to automate the deploy of the three apps per branch, with a manual flow to deploy a specific commit to a chosen environment and a manual flow to roll back to a previously delivered commit.

## Scope

GitHub Actions workflows that deliver the three apps (`services` to DigitalOcean App Platform, `web` and `landing` to their Cloudflare Pages projects) to the `dev` environment on merge to `develop` and to the `prod` environment on merge to `main`, reusing the existing `.do/deploy.sh` and `.cloudflare/deploy.sh` entry points rather than replacing them. It also covers two manually triggered flows — deploy an arbitrary commit to a chosen environment, and redeploy a previously delivered commit — plus the cross-cutting behaviour of a deploy run: publishing each SPA's trace-resolution artifacts under the exact version being shipped, printing the environment and commit being delivered, keeping per-environment configuration and secrets outside the repository, and serialising concurrent runs targeting the same environment.

## Out of scope

- Running tests and linting inside the pipeline.
- Per-pull-request preview environments.
- Deploy notifications to external channels (Slack, email, etc.).
- Provisioning the provider accounts and projects (DigitalOcean app, Cloudflare Pages projects, error-tracking projects and tokens).
- Database migrations as part of the deploy.
- Changing the deploy mechanics already delivered by INFRA-008 and INFRA-009 (`.do/app.yaml` structure, `envsubst` + `doctl --upsert`, `wrangler pages deploy` of `apps/<app>/dist`).
- Custom domains for any environment.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN a commit is merged into the integration branch `develop`, the system shall deploy `services`, `web` and `landing` from that commit to the `dev` environment with no manual step. |
| R002 | Event-driven | WHEN a commit is merged into the main branch `main`, the system shall deploy `services`, `web` and `landing` from that commit to the `prod` environment with no manual step. |
| R003 | Event-driven | WHEN an operator manually triggers the deploy flow supplying a commit reference and a target environment, the system shall deliver exactly that commit's code to that environment, for the three apps, using the same steps an automatic run uses. |
| R004 | Event-driven | WHEN an operator manually triggers the rollback flow supplying a previously delivered commit reference and a target environment, the system shall redeploy that commit to that environment so the environment serves that version again. |
| R005 | Event-driven | WHEN a SPA (`web` or `landing`) is deployed, the system shall publish to the error-tracking provider the trace-resolution artifacts (source maps) produced by that same build, identified by the release identifier of the version being published, and shall not leave those artifacts served publicly next to the bundle. |
| R006 | Ubiquitous | The system shall print in every deploy run's output the target environment and the exact commit SHA being delivered, for each of the three apps, together with the resulting public URL reported by the provider. |
| R007 | Event-driven | WHEN a deploy run targeting an environment starts while another run targeting the same environment is still in progress, the system shall hold the newer run until the in-progress one finishes and then execute it in full, instead of cancelling either of them. |
| R008 | Ubiquitous | The system shall resolve every environment-dependent value and every credential the deploy needs from the CI provider's configuration for the selected environment, so the same workflow definition serves `dev` and `prod` with no branching on hardcoded values. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | No secret required to deploy shall be committed: an inspection of the repository at any commit produced by this feature shall find no DigitalOcean token, Cloudflare account ID or API token, error-tracking auth token, database connection string, Clerk key or Mobbex credential — every one of them shall be read at run time from the CI provider's encrypted secret storage, consistent with the existing git-ignored `.do/.env.deploy.<environment>` and `.cloudflare/.env.deploy.<app>.<environment>` files never leaving the developer machine. |
| NF002 | IF the deploy of one app fails, THEN the run shall terminate with a failed conclusion and its output shall state, for each of the three apps, whether it was published and at which commit — so a partial delivery is never reported as a success and the divergence between the published apps is readable from the run output alone. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the backend and the SPAs are deployed in the same run and one of them fails after another has already published, the environment is left with the API and the frontend on different versions; the system shall fail the run (per NF002) and its output shall list, per app, the published/not-published status and the commit, and the documentation shall state that recovering from a partial delivery is done by re-running the manual deploy flow (R003) with the same commit, or the rollback flow (R004) with the previous one — no automatic compensation is attempted. Assumption: automatic rollback on partial failure is not implied by the feature and is the riskier behaviour, so the conservative choice is to fail loudly and leave the decision to the operator. |
| EC002 | WHEN a SPA build's trace-resolution artifacts are uploaded, the release identifier used for the upload shall be exactly the same value the published bundle reports as its release at run time (both derived from the commit SHA being deployed), so a reported stack trace resolves against the matching version; and IF the artifact upload fails, THEN the build shall fail and the run shall not publish that SPA. Note: `apps/web/vite.config.ts` already enforces the second half through an `errorHandler` that rethrows the plugin's upload error, but `apps/landing/vite.config.ts` has no such override, so a failed upload there is currently logged and swallowed and `vite build` exits 0 — this feature must close that asymmetry. |
| EC003 | WHEN a rollback (R004) is executed for `services`, only application code is reverted; the system shall print an explicit warning in the run output stating that already-applied data changes are not reverted and that the operator must verify the previous version's compatibility with the current database state before confirming the rollback as complete, and the documentation shall record the same caveat (schema migrations remain out of scope). |
| EC004 | WHEN two merges land on the same branch in quick succession, the system shall serialise both runs on the target environment (per R007) and the environment shall end up serving the commit of the run that was queued last, never the earlier one — the run output shall make the delivered commit unambiguous (per R006). |
| EC005 | WHEN a deploy runs after someone added an environment variable directly in a provider's console, the reconciliation overwrites the console state and that variable disappears; the system shall keep the versioned specification plus the CI-provided values as the single source of truth for every environment's configuration, and the documentation shall state that console edits are not preserved and that any new variable must be added to `.do/app.yaml` (or the SPA values contract) and to the environment's CI configuration before the next deploy — consistent with what `.do/README.md` already documents for manual runs. |
| EC006 | WHEN the SPA deploys finish while the backend deploy is still progressing on the platform (their durations differ substantially), the system shall not report the run as successful until all three app deploys have reached a terminal state — the backend step shall wait for the platform to finish the deployment (as `doctl apps create --upsert --wait` already does) rather than returning as soon as the deployment is accepted. |

## Technical constraints

- Automation platform: **GitHub Actions**. No second CI provider is introduced.
- Branching strategy: `feature branch → develop (dev) → main (prod)`. The workflows key their target environment off these two branches.
- Per-environment configuration must live in a single place and must not be duplicated per app. This is a structural restriction on how the workflows and values are organised rather than a runtime-observable behaviour, so it is recorded here instead of as an NF-ID. Today each environment needs three separate values files (`.do/.env.deploy.<environment>`, `.cloudflare/.env.deploy.web.<environment>`, `.cloudflare/.env.deploy.landing.<environment>`) with overlapping values (e.g. the backend public URL is `VITE_API_URL` for both SPAs and the `CORS_ORIGIN` input for the backend); the design must define one per-environment source that feeds all three app deploys.
- The existing deploy entry points are inputs, not rewrites: `.do/deploy.sh <values-file>` and `.cloudflare/deploy.sh <web|landing> <values-file>` must remain the single build-and-publish path, invoked by the workflows, so a manual local deploy and a pipeline deploy stay equivalent.
- `.do/app.yaml` declares the backend source as a GitHub **branch** (`branch: ${GIT_BRANCH}`, `deploy_on_push: false`), so a plain reconcile delivers the tip of that branch rather than a chosen commit. R003 and R004 require the delivered backend code to be pinned to a specific commit; the design must resolve how (this is the main open technical question of the feature) without breaking the `envsubst` + `--upsert` reconcile model or the `${PORT}`-shared health-check wiring.
- `wrangler` is a pinned root `devDependency` invoked via `pnpm exec wrangler`, and `doctl` is required on the runner; the workflows must provide both without ad-hoc network fetches of unpinned versions.
- The SPA builds already run from the monorepo root with `pnpm install --frozen-lockfile` so `workspace:*` dependencies resolve; the pipeline must preserve that (no per-app isolated build).
- Source-map generation and upload are gated on `SENTRY_AUTH_TOKEN` being present in the build environment (`sourceMapsEnabled` in both `vite.config.ts` files); the pipeline must supply it for every environment where R005 applies.
- `.do/tests` and `.cloudflare/tests` cover the existing deploy assets; any change to `.do/app.yaml`, `.do/deploy.sh` or `.cloudflare/deploy.sh` must keep those suites passing.

## Dependencies

- LANDING-003 — the inventory of environment variables, secrets and build steps must be complete and stable before automating it. It is DONE, so the dependency is satisfied.
- INFRA-008 and INFRA-009 — the DigitalOcean and Cloudflare Pages deploy mechanics that the workflows orchestrate.
- WEB-002 / LANDING-002 — the trace-resolution artifact generation and release-identifier conventions that R005 and EC002 build on.
- Provider credentials available as CI secrets per environment (DigitalOcean access token, Cloudflare account ID and API token, error-tracking org/project/auth token) plus the full set of runtime values for `.do/app.yaml`, before the first automated run.

## Effort estimate

**high** — 8 functional requirements spanning two automatic branch-triggered deploys, two manual flows (arbitrary commit and rollback), artifact publication, run-output traceability, concurrency serialisation and per-environment configuration resolution; a secret-exposure guarantee and a partial-failure visibility guarantee as NFRs; six edge cases covering cross-provider partial delivery, release/artifact alignment, data-change irreversibility on rollback, queued concurrent merges, console configuration drift and divergent deploy durations; plus an unresolved technical question (pinning the backend deploy to a specific commit given the branch-based `.do/app.yaml` source) and dependencies on external provider credentials for two environments.
