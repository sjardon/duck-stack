# INFRA-004 — CI/CD Pipeline (GitHub Actions) — Analysis

## Reason for being

The cloud infrastructure is already provisioned (INFRA-002 for ECR/App Runner and INFRA-003 for S3/CloudFront), but there is no automation to build, ship, and roll back the three applications (`services`, `web`, `landing`). Today every deployment would be a manual operation, which is error-prone, slow, and incompatible with the branching strategy `feature branch -> develop -> main`.

The objective is to configure GitHub Actions workflows that build artifacts, deploy automatically on merge to the corresponding branch, support manual deploys of a specific commit SHA to a chosen environment, and provide a rollback path by re-deploying a previous SHA. Two environments are supported: `dev` (mapped to `develop`) and `prod` (mapped to `main`). AWS credentials must never be stored as long-lived secrets — authentication is performed via OIDC.

## Scope

GitHub Actions workflows covering:
- Continuous deploy on merge to `develop` (environment `dev`) and `main` (environment `prod`) for all three apps.
- Building and pushing the `services` Docker image to ECR tagged with the commit SHA, and updating the App Runner service to that image.
- Building the `web` and `landing` Vite bundles, uploading them to the environment-specific S3 buckets, and invalidating the corresponding CloudFront distribution.
- A manual `workflow_dispatch` workflow that re-deploys an arbitrary SHA to a chosen environment.
- A manual `workflow_dispatch` rollback workflow that re-deploys a previous SHA to a chosen environment.
- AWS authentication via OIDC using `aws-actions/configure-aws-credentials`, with no static access keys stored as GitHub secrets.
- Log output that surfaces the environment and SHA being deployed by each job.

## Out of scope

- Execution of automated tests inside the pipeline (covered by a separate feature).
- Deploy notifications to external systems (Slack, email, etc.).
- Per-pull-request preview environments.
- Custom domain configuration for the `dev` or `prod` environments.
- Provisioning of the underlying AWS resources (handled by INFRA-002 and INFRA-003).
- Database migrations or seed-data steps.

## Functional requirements

| ID   | Requirement |
|------|-------------|
| R001 | WHEN a commit is merged to the `develop` branch, the system shall trigger a deploy workflow that targets the `dev` environment. |
| R002 | WHEN a commit is merged to the `main` branch, the system shall trigger a deploy workflow that targets the `prod` environment. |
| R003 | WHEN the deploy workflow runs for `services`, the system shall build a Docker image and push it to the environment's ECR repository tagged with the commit SHA. |
| R004 | WHEN a new `services` image has been pushed to ECR, the system shall update the corresponding App Runner service so that it serves the image tagged with that commit SHA. |
| R005 | WHEN the deploy workflow runs for `web`, the system shall build the production bundle and upload the resulting assets to the S3 bucket that corresponds to the target environment. |
| R006 | WHEN the deploy workflow runs for `landing`, the system shall build the production bundle and upload the resulting assets to the S3 bucket that corresponds to the target environment. |
| R007 | WHEN the `web` or `landing` assets have been uploaded to S3, the system shall create a CloudFront invalidation for the corresponding distribution so users see the new version. |
| R008 | The system shall expose a manual `workflow_dispatch` workflow that accepts a target environment and a commit SHA, and deploys that SHA to that environment using the same build/push/update steps as the automatic deploy. |
| R009 | The system shall expose a manual `workflow_dispatch` rollback workflow that accepts a target environment and a previous commit SHA, and re-deploys that SHA to that environment. |
| R010 | The system shall authenticate to AWS using OIDC via `aws-actions/configure-aws-credentials`, assuming an IAM role scoped to the target environment, without using long-lived AWS access keys stored as GitHub secrets. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NF001 | The pipeline shall not store AWS access keys or secret access keys as GitHub repository or environment secrets; all AWS authentication shall happen through OIDC-issued short-lived credentials. |
| NF002 | Every deploy job shall log, in a clearly visible way, the target environment and the commit SHA it is deploying so operators can audit and trace each run. |

## Edge cases

| ID    | Edge case |
|-------|-----------|
| EC001 | If a manual `workflow_dispatch` deploy is invoked with a SHA that does not exist in the repository, the workflow shall fail fast with a clear error rather than producing an undefined deploy. |
| EC002 | If a rollback workflow is invoked with a SHA whose `services` image is no longer present in ECR, the workflow shall fail with a clear error rather than silently deploying a stale or wrong image. |
| EC003 | If two deploys to the same environment are triggered close together (for example, two rapid merges to `develop`), the pipeline shall ensure they do not interleave in a way that leaves the environment in a partially updated state. |
| EC004 | If the App Runner image update succeeds but App Runner fails to reach a healthy state, the workflow shall surface the failure rather than reporting a successful deploy. |
| EC005 | If the S3 upload succeeds but the CloudFront invalidation fails, the workflow shall fail loudly so the operator knows that users may still be served the previous cached version. |
| EC006 | If the OIDC role assumption fails (misconfigured trust policy, wrong environment, expired configuration), the workflow shall stop before performing any AWS mutation and report the authentication failure. |
| EC007 | If a deploy is triggered from a branch other than `develop` or `main` via the automatic trigger, the workflow shall not deploy to any environment. |

## Technical constraints

- CI/CD platform: GitHub Actions.
- AWS authentication: OIDC via `aws-actions/configure-aws-credentials` (no static access keys).
- Branching strategy: `feature branch -> develop -> main`.
- Environments: `dev` (mapped to `develop`), `prod` (mapped to `main`).
- Container image tagging: commit SHA.
- Container registry: AWS ECR (per environment, provisioned in INFRA-002).
- Container runtime: AWS App Runner (per environment, provisioned in INFRA-002).
- Static asset hosting: AWS S3 + CloudFront (per environment, provisioned in INFRA-003).
- Cache invalidation: CloudFront `create-invalidation` after each `web`/`landing` deploy.

## Dependencies

- INFRA-002 — ECR repositories and App Runner services must exist in both `dev` and `prod` environments before the pipeline can push images and update services.
- INFRA-003 — S3 buckets and CloudFront distributions must exist in both `dev` and `prod` environments before the pipeline can upload assets and invalidate caches.

## Effort estimate

**high** — 10 functional requirements covering three apps and two environments, two manual workflows (deploy and rollback) in addition to two automatic ones, NFRs that include a hard security constraint (no static AWS keys, OIDC-only), 7 edge cases that cover failure modes across ECR, App Runner, S3, CloudFront, and OIDC, and two upstream infrastructure dependencies (INFRA-002 and INFRA-003) that the workflows must integrate with.
