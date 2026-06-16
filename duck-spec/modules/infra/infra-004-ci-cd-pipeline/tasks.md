# INFRA-004 — CI/CD Pipeline (GitHub Actions): Tasks

## T001 — Create reusable `_deploy-services.yml` workflow

**File:** `.github/workflows/_deploy-services.yml`  
**Action:** CREATE

Define a `workflow_call` reusable workflow with inputs `environment` (string) and `sha` (string) and inherited secret `AWS_OIDC_ROLE_ARN`.

In the single job `deploy` (runs-on `ubuntu-latest`), set `environment: ${{ inputs.environment }}` so GitHub resolves environment variables (`AWS_REGION`, `ECR_REPOSITORY_URL`, `APP_RUNNER_SERVICE_ARN`) and secrets from the named environment. Set `concurrency: group: deploy-services-${{ inputs.environment }}` with `cancel-in-progress: false`.

Steps in order:
1. Echo `"Deploying services SHA=${{ inputs.sha }} to environment=${{ inputs.environment }}"`.
2. `actions/checkout@v4` with `ref: ${{ inputs.sha }}`.
3. `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}`, `aws-region: ${{ vars.AWS_REGION }}`, `role-session-name: github-actions-${{ inputs.environment }}-services-${{ inputs.sha }}`.
4. `aws-actions/amazon-ecr-login@v2`.
5. `docker build -t ${{ vars.ECR_REPOSITORY_URL }}:${{ inputs.sha }} apps/services`.
6. `docker push ${{ vars.ECR_REPOSITORY_URL }}:${{ inputs.sha }}`.
7. `aws apprunner update-service` with `--service-arn ${{ vars.APP_RUNNER_SERVICE_ARN }}` and image identifier set to `${{ vars.ECR_REPOSITORY_URL }}:${{ inputs.sha }}`.
8. `aws apprunner wait service-running --service-arn ${{ vars.APP_RUNNER_SERVICE_ARN }}`.

**Covers:** R003, R004, R010, NF001, NF002, EC003, EC004, EC006

---

## T002 — Create reusable `_deploy-web.yml` workflow

**File:** `.github/workflows/_deploy-web.yml`  
**Action:** CREATE

Define a `workflow_call` reusable workflow with the same inputs and inherited secret as T001.

In the single job `deploy` (runs-on `ubuntu-latest`), set `environment: ${{ inputs.environment }}` so GitHub resolves environment variables (`AWS_REGION`, `WEB_S3_BUCKET`, `WEB_CLOUDFRONT_DISTRIBUTION_ID`) and secrets. Set `concurrency: group: deploy-web-${{ inputs.environment }}` with `cancel-in-progress: false`.

Steps in order:
1. Echo `"Deploying web SHA=${{ inputs.sha }} to environment=${{ inputs.environment }}"`.
2. `actions/checkout@v4` with `ref: ${{ inputs.sha }}`.
3. `pnpm/action-setup@v4`.
4. `actions/setup-node@v4` with `node-version: lts/*` and `cache: pnpm`.
5. `pnpm install --frozen-lockfile`.
6. `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}`, `aws-region: ${{ vars.AWS_REGION }}`, `role-session-name: github-actions-${{ inputs.environment }}-web-${{ inputs.sha }}`.
7. `pnpm --filter web build`.
8. `aws s3 sync apps/web/dist/ s3://${{ vars.WEB_S3_BUCKET }} --delete`.
9. `aws cloudfront create-invalidation --distribution-id ${{ vars.WEB_CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"`.

**Covers:** R005, R007, R010, NF001, NF002, EC003, EC005, EC006

---

## T003 — Create reusable `_deploy-landing.yml` workflow

**File:** `.github/workflows/_deploy-landing.yml`  
**Action:** CREATE

Define a `workflow_call` reusable workflow identical in structure to T002, substituting `web` with `landing` throughout: filter `pnpm --filter landing build`, output directory `apps/landing/dist/`, environment variables `LANDING_S3_BUCKET` and `LANDING_CLOUDFRONT_DISTRIBUTION_ID`, log message `"Deploying landing SHA=…"`, concurrency group `deploy-landing-${{ inputs.environment }}`, and role session name suffix `-landing-`.

**Covers:** R006, R007, R010, NF001, NF002, EC003, EC005, EC006

---

## T004 — Create push-triggered orchestration workflow (`deploy.yml`)

**File:** `.github/workflows/deploy.yml`  
**Action:** CREATE  
**Depends on:** T001, T002, T003

Define a workflow triggered by `on: push: branches: [develop, main]`. This branch filter is the sole gate preventing non-deploy branches from triggering a deploy (EC007).

**Job `resolve-env`** (runs-on `ubuntu-latest`): use a bash step that sets output `environment-name` to `dev` when `$GITHUB_REF` equals `refs/heads/develop` and to `prod` when it equals `refs/heads/main`. Use `>> $GITHUB_OUTPUT` for the output.

**Job `deploy-services`**: `uses: ./.github/workflows/_deploy-services.yml`, `needs: [resolve-env]`, with:
```
with:
  environment: ${{ needs.resolve-env.outputs.environment-name }}
  sha: ${{ github.sha }}
secrets: inherit
```

**Job `deploy-web`**: same pattern using `./.github/workflows/_deploy-web.yml`, `needs: [resolve-env]`, parallel with `deploy-services`.

**Job `deploy-landing`**: same pattern using `./.github/workflows/_deploy-landing.yml`, `needs: [resolve-env]`, parallel with `deploy-services` and `deploy-web`.

**Covers:** R001, R002, EC007

---

## T005 — Create manual deploy workflow (`deploy-manual.yml`)

**File:** `.github/workflows/deploy-manual.yml`  
**Action:** CREATE  
**Depends on:** T001, T002, T003

Define a workflow triggered by `on: workflow_dispatch` with two inputs:
- `environment`: type `choice`, options `[dev, prod]`, required, description `"Target environment"`.
- `sha`: type `string`, required, description `"Full commit SHA to deploy"`.

**Job `validate-sha`** (runs-on `ubuntu-latest`): steps are:
1. `actions/checkout@v4` with `fetch-depth: 0`.
2. A bash step that runs `git fetch --depth=1 origin ${{ inputs.sha }}` and on failure runs `echo "::error::SHA ${{ inputs.sha }} does not exist in the repository" && exit 1` (EC001).

**Job `deploy-services`**: `uses: ./.github/workflows/_deploy-services.yml`, `needs: [validate-sha]`, with:
```
with:
  environment: ${{ inputs.environment }}
  sha: ${{ inputs.sha }}
secrets: inherit
```

**Job `deploy-web`**: same pattern using `./.github/workflows/_deploy-web.yml`, `needs: [validate-sha]`, parallel with `deploy-services`.

**Job `deploy-landing`**: same pattern using `./.github/workflows/_deploy-landing.yml`, `needs: [validate-sha]`, parallel with `deploy-services` and `deploy-web`.

**Covers:** R008, EC001

---

## T006 — Create rollback workflow (`rollback.yml`)

**File:** `.github/workflows/rollback.yml`  
**Action:** CREATE  
**Depends on:** T001, T002, T003

Define a workflow triggered by `on: workflow_dispatch` with two inputs:
- `environment`: type `choice`, options `[dev, prod]`, required, description `"Target environment to roll back"`.
- `sha`: type `string`, required, description `"Previous commit SHA to re-deploy"`.

**Job `validate-sha`** (runs-on `ubuntu-latest`): steps are:
1. `actions/checkout@v4` with `fetch-depth: 0`.
2. A bash step that runs `git fetch --depth=1 origin ${{ inputs.sha }}` and on failure emits `::error::` and exits 1 (EC001, same guard as T005).
3. `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}` and `aws-region` from the environment variable `AWS_REGION`. Set `environment: ${{ inputs.environment }}` on this job so the correct `AWS_OIDC_ROLE_ARN` and `AWS_REGION` are resolved.
4. A bash step that derives the ECR repository name from `ECR_REPOSITORY_URL` (the path segment after the registry host), then runs `aws ecr describe-images --repository-name <name> --image-ids imageTag=${{ inputs.sha }}` and on failure emits `::error::ECR image for SHA ${{ inputs.sha }} not found in environment ${{ inputs.environment }}. Rollback aborted.` and exits 1 (EC002).

**Jobs `deploy-services`, `deploy-web`, `deploy-landing`**: identical to T005 — each calls the corresponding reusable workflow with `needs: [validate-sha]`, `environment` and `sha` from inputs, `secrets: inherit`.

**Covers:** R009, EC001, EC002
