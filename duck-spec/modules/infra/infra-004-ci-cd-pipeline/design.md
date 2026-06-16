# INFRA-004 — CI/CD Pipeline (GitHub Actions): Design

## Problem statement

The cloud infrastructure for all three applications (`services`, `web`, `landing`) is fully provisioned (INFRA-002 and INFRA-003), but every deployment is currently a manual operation. There is no automation to build artifacts, push them to the appropriate AWS resource, or roll back to a previous version. The objective is to wire GitHub Actions workflows to the existing branching strategy (`feature branch → develop → main`) so that merging to `develop` deploys to `dev` and merging to `main` deploys to `prod`, while also providing manual deploy and rollback escape hatches authenticated exclusively via OIDC.

## Alternatives

| # | Name | Description | Decision |
|---|------|-------------|----------|
| 1 | Monolithic single workflow | One large YAML file handles all three apps and both environments with matrix jobs and `if` conditionals sharing a single push trigger. | Not chosen — creates a single point of failure, prevents per-app re-runs, and produces an unreadable YAML file that violates maintainability constraints. |
| 2 | Per-app reusable workflows + orchestration callers | Three reusable `workflow_call` files (one per app) are invoked in parallel by a top-level push-triggered workflow and by explicit manual dispatch workflows. | Chosen — cleanest separation of concerns, independently re-runnable per app, and maps directly to the three distinct build/deploy paths required by R003–R007. |
| 3 | Composite Actions per app + orchestration workflows | GitHub Composite Actions in `.github/actions/` encapsulate per-app steps; orchestration workflows call them. | Not chosen — adds an unnecessary layer of abstraction (actions + workflows) without benefit given all work stays in this monorepo; composite actions cannot be independently triggered, which does not simplify the manual dispatch requirement. |

## Chosen solution

**Per-app reusable workflows + orchestration callers**

Three reusable workflow files expose a `workflow_call` interface (`services`, `web`, `landing`). A single push-triggered orchestration workflow resolves the target environment from the branch name and calls all three reusable workflows in parallel. Two additional `workflow_dispatch` workflows (manual deploy and rollback) accept environment and SHA inputs and call the same reusable workflows. This structure satisfies R001–R010 with no code duplication across environments: environment-specific configuration (ECR URL, App Runner ARN, S3 bucket name, CloudFront distribution ID, IAM role ARN) is read from GitHub Environment secrets/variables, keeping the workflow logic environment-agnostic.

## Technical design

### GitHub Environments and secret/variable names

Two GitHub Environments are required: `dev` and `prod`. Each environment carries the following repository variables (non-sensitive) and secrets (sensitive):

**Variables (non-sensitive, stored as environment variables in the GitHub Environment)**

| Variable name | Example value (dev) | Example value (prod) |
|---|---|---|
| `AWS_REGION` | `us-east-1` | `us-east-1` |
| `ECR_REPOSITORY_URL` | `123456789.dkr.ecr.us-east-1.amazonaws.com/duck-stack-dev-services` | `…duck-stack-prod-services` |
| `APP_RUNNER_SERVICE_ARN` | `arn:aws:apprunner:…:service/duck-stack-dev-services/…` | `arn:aws:apprunner:…:service/duck-stack-prod-services/…` |
| `WEB_S3_BUCKET` | `duck-stack-dev-web` | `duck-stack-prod-web` |
| `LANDING_S3_BUCKET` | `duck-stack-dev-landing` | `duck-stack-prod-landing` |
| `WEB_CLOUDFRONT_DISTRIBUTION_ID` | `E1ABCDEF…` | `E2ABCDEF…` |
| `LANDING_CLOUDFRONT_DISTRIBUTION_ID` | `E3ABCDEF…` | `E4ABCDEF…` |

**Secrets (sensitive, stored as environment secrets in the GitHub Environment)**

| Secret name | Description |
|---|---|
| `AWS_OIDC_ROLE_ARN` | ARN of the IAM role that GitHub Actions assumes via OIDC for this environment. |

No static AWS access keys are stored anywhere (NF001, R010).

### OIDC trust policy (IAM, informational — not a workflow file)

Each environment's IAM role must have a trust policy that allows `token.actions.githubusercontent.com` as the OIDC provider with condition `sub` matching `repo:sjardon/duck-stack:environment:<env-name>`. This is a prerequisite (infrastructure concern), not a workflow concern. It is documented here so the implementer can verify it exists before testing.

### Workflow file layout

```
.github/
  workflows/
    deploy.yml                  # Push-triggered orchestration: resolves env, calls reusable workflows
    deploy-manual.yml           # workflow_dispatch: accepts env + SHA, calls reusable workflows
    rollback.yml                # workflow_dispatch: accepts env + previous SHA, calls reusable workflows
    _deploy-services.yml        # Reusable workflow_call: build Docker image, push to ECR, update App Runner
    _deploy-web.yml             # Reusable workflow_call: build Vite bundle, sync to S3, invalidate CloudFront
    _deploy-landing.yml         # Reusable workflow_call: build Vite bundle, sync to S3, invalidate CloudFront
```

Files prefixed with `_` are reusable (`workflow_call`) and are never triggered directly by push or dispatch events.

### Reusable workflow interface

All three reusable workflows share the same `workflow_call` input/secret interface so callers are uniform:

**Inputs:**
| Input | Type | Description |
|---|---|---|
| `environment` | `string` | GitHub Environment name (`dev` or `prod`). Used to resolve environment variables and secrets. |
| `sha` | `string` | Full commit SHA to deploy. Used as the Docker image tag for `services` and as the checkout ref for `web`/`landing`. |

**Secrets (inherited from the calling workflow's environment context):**
| Secret | Description |
|---|---|
| `AWS_OIDC_ROLE_ARN` | Passed from the environment secret of the same name. |

**Environment variables consumed inside each reusable workflow (resolved from the GitHub Environment set by `environment` input):**
`AWS_REGION`, `ECR_REPOSITORY_URL` (`_deploy-services.yml` only), `APP_RUNNER_SERVICE_ARN` (`_deploy-services.yml` only), `WEB_S3_BUCKET` (`_deploy-web.yml` only), `WEB_CLOUDFRONT_DISTRIBUTION_ID` (`_deploy-web.yml` only), `LANDING_S3_BUCKET` (`_deploy-landing.yml` only), `LANDING_CLOUDFRONT_DISTRIBUTION_ID` (`_deploy-landing.yml` only).

### Push-triggered orchestration workflow (`deploy.yml`)

Trigger: `push` to `develop` or `main` branches only (EC007 — the `branches` filter prevents any other branch from triggering a deploy).

```
on:
  push:
    branches: [develop, main]
```

**Job: `resolve-env`** — A single-step job that sets `environment-name` output to `dev` when `github.ref` is `refs/heads/develop` and `prod` when `github.ref` is `refs/heads/main`. Uses a bash conditional on `$GITHUB_REF`.

**Jobs: `deploy-services`, `deploy-web`, `deploy-landing`** — Each uses `uses: ./.github/workflows/_deploy-services.yml` (etc.) with:
```
with:
  environment: ${{ needs.resolve-env.outputs.environment-name }}
  sha: ${{ github.sha }}
secrets: inherit
```
All three deploy jobs depend on `resolve-env` and run in parallel with each other.

### Manual deploy workflow (`deploy-manual.yml`)

Trigger: `workflow_dispatch` with inputs:
- `environment`: choice of `dev` or `prod`
- `sha`: string (the commit SHA to deploy)

**Job: `validate-sha`** — Runs `git fetch --depth=1 origin <sha>` and fails with `exit 1` and a clear message if the SHA does not exist in the remote (EC001). This job runs before any AWS interaction.

**Jobs: `deploy-services`, `deploy-web`, `deploy-landing`** — Same reusable workflow calls as `deploy.yml`, but with `inputs.environment` and `inputs.sha` as inputs. All three depend on `validate-sha` and run in parallel.

### Rollback workflow (`rollback.yml`)

Trigger: `workflow_dispatch` with inputs:
- `environment`: choice of `dev` or `prod`
- `sha`: string (the previous commit SHA to re-deploy)

Structurally identical to `deploy-manual.yml`. The `validate-sha` job additionally verifies (for `services`) that the ECR image with the given SHA tag exists, using `aws ecr describe-images --repository-name <repo> --image-ids imageTag=<sha>` and failing loudly if the image is absent (EC002). This check runs after OIDC authentication so the AWS CLI is available.

Both `deploy-manual.yml` and `rollback.yml` share the same underlying reusable workflows; the difference is the purpose documented in the workflow `name` field and the ECR image pre-check in `rollback.yml`.

### Reusable workflow: `_deploy-services.yml`

Steps inside the single job (`deploy`), running on `ubuntu-latest`:

1. **Log environment and SHA** — `echo "Deploying services SHA=${{ inputs.sha }} to environment=${{ inputs.environment }}"` (NF002).
2. **Checkout** — `actions/checkout@v4` with `ref: ${{ inputs.sha }}`.
3. **Configure AWS credentials** — `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}`, `aws-region: ${{ vars.AWS_REGION }}`, `role-session-name: github-actions-${{ inputs.environment }}-${{ inputs.sha }}`. If role assumption fails, the step fails and no AWS mutations occur (EC006, R010, NF001).
4. **Login to ECR** — `aws-actions/amazon-ecr-login@v2`.
5. **Build Docker image** — `docker build -t ${{ vars.ECR_REPOSITORY_URL }}:${{ inputs.sha }} apps/services` (R003).
6. **Push Docker image** — `docker push ${{ vars.ECR_REPOSITORY_URL }}:${{ inputs.sha }}` (R003).
7. **Update App Runner service** — `aws apprunner update-service --service-arn ${{ vars.APP_RUNNER_SERVICE_ARN }} --source-configuration ImageRepository={ImageIdentifier=${{ vars.ECR_REPOSITORY_URL }}:${{ inputs.sha }},…}` (R004).
8. **Wait for App Runner to reach RUNNING status** — `aws apprunner wait service-running --service-arn ${{ vars.APP_RUNNER_SERVICE_ARN }}`. The `wait` command polls App Runner and exits non-zero if the service does not reach `RUNNING` within the timeout, surfacing the failure rather than reporting success (EC004).

Concurrency: the job sets `concurrency: group: deploy-services-${{ inputs.environment }}` with `cancel-in-progress: false` so two concurrent deploys to the same environment queue rather than interleave (EC003).

### Reusable workflow: `_deploy-web.yml`

Steps inside the single job (`deploy`), running on `ubuntu-latest`:

1. **Log environment and SHA** — `echo "Deploying web SHA=${{ inputs.sha }} to environment=${{ inputs.environment }}"` (NF002).
2. **Checkout** — `actions/checkout@v4` with `ref: ${{ inputs.sha }}`.
3. **Setup Node / pnpm** — `actions/setup-node@v4` (LTS) and `pnpm/action-setup@v4`.
4. **Install dependencies** — `pnpm install --frozen-lockfile`.
5. **Configure AWS credentials** — same as `_deploy-services.yml` (EC006, R010, NF001).
6. **Build web bundle** — `pnpm --filter web build` (R005). Output is in `apps/web/dist/`.
7. **Sync to S3** — `aws s3 sync apps/web/dist/ s3://${{ vars.WEB_S3_BUCKET }} --delete` (R005).
8. **Invalidate CloudFront** — `aws cloudfront create-invalidation --distribution-id ${{ vars.WEB_CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"`. If this step fails the job fails loudly (EC005, R007).

Concurrency: `concurrency: group: deploy-web-${{ inputs.environment }}`, `cancel-in-progress: false` (EC003).

### Reusable workflow: `_deploy-landing.yml`

Identical to `_deploy-web.yml` with `web` replaced by `landing` throughout — `pnpm --filter landing build`, `apps/landing/dist/`, `vars.LANDING_S3_BUCKET`, `vars.LANDING_CLOUDFRONT_DISTRIBUTION_ID` (R006, R007).

Concurrency: `concurrency: group: deploy-landing-${{ inputs.environment }}`, `cancel-in-progress: false` (EC003).

### Concurrency and serialization strategy (EC003)

Every reusable workflow job uses a `concurrency` group keyed to `<app>-<environment>`. `cancel-in-progress: false` means a second run queues behind the first rather than cancelling it. This ensures only one deploy per app per environment is active at a time, preventing interleaved partial updates.

### Failure surface guarantees

| Failure scenario | Mechanism |
|---|---|
| SHA does not exist (EC001) | `git fetch --depth=1 origin <sha>` exits non-zero in `validate-sha` job before any AWS call |
| ECR image absent for rollback (EC002) | `aws ecr describe-images` exits non-zero in rollback's `validate-sha` job |
| Two concurrent deploys (EC003) | `concurrency` group with `cancel-in-progress: false` serializes them |
| App Runner unhealthy after update (EC004) | `aws apprunner wait service-running` exits non-zero |
| CloudFront invalidation failure (EC005) | Step has no `continue-on-error`; job fails loudly |
| OIDC role assumption failure (EC006) | `aws-actions/configure-aws-credentials` exits non-zero before any AWS mutation |
| Push from non-deploy branch (EC007) | `branches: [develop, main]` filter on `deploy.yml` — other branches never trigger the workflow |

## Files

| Path | Action |
|---|---|
| `.github/workflows/deploy.yml` | CREATE |
| `.github/workflows/deploy-manual.yml` | CREATE |
| `.github/workflows/rollback.yml` | CREATE |
| `.github/workflows/_deploy-services.yml` | CREATE |
| `.github/workflows/_deploy-web.yml` | CREATE |
| `.github/workflows/_deploy-landing.yml` | CREATE |

## Requirement coverage

| ID | Design decision that satisfies it |
|---|---|
| R001 | `deploy.yml` triggers on `push` to `develop`; `resolve-env` job maps `develop` → `dev` and passes `environment: dev` to all three reusable workflows. |
| R002 | `deploy.yml` triggers on `push` to `main`; `resolve-env` job maps `main` → `prod` and passes `environment: prod` to all three reusable workflows. |
| R003 | `_deploy-services.yml` steps 5–6: `docker build` targeting `apps/services` and `docker push` to `ECR_REPOSITORY_URL` tagged with `inputs.sha`. |
| R004 | `_deploy-services.yml` step 7: `aws apprunner update-service` with the new image tag; step 8: `aws apprunner wait service-running` confirms the service reaches RUNNING. |
| R005 | `_deploy-web.yml` steps 6–7: `pnpm --filter web build` then `aws s3 sync apps/web/dist/ s3://WEB_S3_BUCKET --delete`. |
| R006 | `_deploy-landing.yml` steps 6–7: `pnpm --filter landing build` then `aws s3 sync apps/landing/dist/ s3://LANDING_S3_BUCKET --delete`. |
| R007 | `_deploy-web.yml` step 8 and `_deploy-landing.yml` step 8: `aws cloudfront create-invalidation` with `--paths "/*"` after each S3 sync. |
| R008 | `deploy-manual.yml`: `workflow_dispatch` with `environment` and `sha` inputs; `validate-sha` job verifies the SHA exists; then calls all three reusable workflows with those inputs. |
| R009 | `rollback.yml`: `workflow_dispatch` with `environment` and `sha` inputs; `validate-sha` job verifies SHA exists and ECR image is present; then calls all three reusable workflows with those inputs. |
| R010 | All reusable workflows use `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}`; no `aws-access-key-id` or `aws-secret-access-key` inputs are used anywhere. |
| NF001 | No `aws-access-key-id` or `aws-secret-access-key` values are stored or referenced in any workflow file; the only AWS authentication mechanism is OIDC role assumption via `AWS_OIDC_ROLE_ARN` environment secret. |
| NF002 | Step 1 of every reusable workflow job explicitly logs `"Deploying <app> SHA=<sha> to environment=<env>"` before any build or AWS operation begins. |
