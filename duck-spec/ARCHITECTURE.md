# Architecture

This document records infrastructure, services, deployment topology, and inter-service communication decisions for the Duck Stack project. It is updated whenever a feature introduces or modifies infrastructure components.

---

## AWS Infrastructure (INFRA-002)

The AWS infrastructure is provisioned with Terraform and organised into three child modules under `infra/terraform/modules/`. A single environment is provisioned per Terraform workspace.

### Topology

```
Internet
    │
    ▼
AWS App Runner service (public HTTPS endpoint)
    │  (image pull)
    │──────────────────────────► AWS ECR repository
    │
    │  (VPC connector)
    ▼
VPC  ┌────────────────────────────────────────────┐
     │  Private subnets (≥ 2 AZs)                │
     │  Public  subnets (≥ 2 AZs)                │
     │  Internet Gateway → public route table     │
     └────────────────────────────────────────────┘
    │
    │  (external, not in VPC)
    ▼
Supabase (PostgreSQL — managed externally)
```

### Components

| Component | AWS Resource | Notes |
|-----------|-------------|-------|
| Container registry | `aws_ecr_repository` | Hosts Docker images for `apps/services`. Image scanning on push. Lifecycle policy: expire untagged > 14 days, keep last 10 tagged. |
| Backend service | `aws_apprunner_service` | Runs `services` container. Auto-deployments disabled; image updates triggered by CI/CD (INFRA-004). |
| VPC connector | `aws_apprunner_vpc_connector` | Wires App Runner into private subnets for inbound VPC access. |
| Network | `aws_vpc` + subnets | DNS enabled. Public subnets have IGW route. Private subnets have no NAT gateway. |
| IAM — access role | `aws_iam_role` | Trusted by `build.apprunner.amazonaws.com`. Allows App Runner to pull images from ECR (`AWSAppRunnerServicePolicyForECRAccess`). |
| IAM — instance role | `aws_iam_role` | Trusted by `tasks.apprunner.amazonaws.com`. Grants the running container ECR access (`AWSAppRunnerServicePolicyForECRAccess`). |

### Remote state

| Resource | Purpose |
|----------|---------|
| S3 bucket (`<project>-terraform-state-<account_id>`) | Stores Terraform state with versioning and AES-256 encryption. |
| DynamoDB table (`<project>-terraform-locks`) | Provides state locking via `LockID` hash key — concurrent `terraform apply` runs are rejected. |

The bootstrap module under `infra/terraform/bootstrap/` creates both resources and is applied once with a local backend before the root module is initialised.

### Tagging convention

All AWS resources carry at minimum two tags applied automatically via the AWS provider `default_tags` block:

| Tag | Value |
|-----|-------|
| `project` | Project name (root variable `project`) |
| `environment` | Target environment (root variable `environment`) |

### Key Terraform outputs

| Output | Description |
|--------|-------------|
| `ecr_repository_url` | ECR repository URL; used by CI/CD to push and reference images |
| `app_runner_service_url` | Public HTTPS URL of the `services` backend |
| `vpc_id` | VPC ID; referenced by future infrastructure modules |

### Not managed in AWS

- **Database**: Supabase is used as an external PostgreSQL provider. No RDS or other database resources are provisioned in AWS.
- **Custom domains / SSL**: deferred to a future feature.

---

## Static Hosting — S3 + CloudFront (INFRA-003)

Static assets for the `web` and `landing` SPAs are served through private S3 buckets fronted by CloudFront distributions. Both distributions are provisioned by the reusable `modules/static_site` Terraform module, instantiated twice from the root `main.tf`.

### Topology

```
User (HTTPS)
  │
  ▼
AWS CloudFront distribution  (viewer_protocol_policy: redirect-to-https)
  │  OAC signs request with SigV4
  ▼
AWS S3 bucket  (private — public access blocked on all four flags)
  │
  ├─ object found  ──────────────────────► serve asset
  └─ 403 / 404  → custom_error_response → /index.html, HTTP 200
                                           └─► React Router resolves client-side route
```

This topology is identical for both `web` and `landing`; each has its own bucket and distribution.

### Components

| Component | AWS Resource | Notes |
|-----------|-------------|-------|
| `web` bucket | `aws_s3_bucket` (`<project>-<env>-web`) | Private. All four public-access-block flags enabled. |
| `landing` bucket | `aws_s3_bucket` (`<project>-<env>-landing`) | Private. All four public-access-block flags enabled. |
| `web` OAC | `aws_cloudfront_origin_access_control` | `signing_behavior = "always"`, `signing_protocol = "sigv4"`. |
| `landing` OAC | `aws_cloudfront_origin_access_control` | `signing_behavior = "always"`, `signing_protocol = "sigv4"`. |
| `web` distribution | `aws_cloudfront_distribution` | Origin: `web` bucket regional domain. HTTPS-only. 403/404 → `/index.html` / 200. |
| `landing` distribution | `aws_cloudfront_distribution` | Origin: `landing` bucket regional domain. HTTPS-only. 403/404 → `/index.html` / 200. |
| Bucket policies | `aws_s3_bucket_policy` (×2) | Grant `s3:GetObject` exclusively to the `cloudfront.amazonaws.com` service principal conditioned on the specific distribution ARN. |

### Key Terraform outputs

| Output | Description |
|--------|-------------|
| `web_cloudfront_url` | CloudFront distribution domain name for `apps/web` |
| `landing_cloudfront_url` | CloudFront distribution domain name for `apps/landing` |

### Not managed in this layer

- **Custom domains / SSL**: deferred to a future feature.

---

## CI/CD Pipeline — GitHub Actions (INFRA-004)

All deployments are automated through GitHub Actions. The pipeline targets two GitHub Environments — `dev` and `prod` — that correspond to the `develop` and `main` branches respectively.

### Deployment topology

```
GitHub repository
  │
  ├─ push to develop ──► deploy.yml ──► resolve env=dev
  ├─ push to main    ──► deploy.yml ──► resolve env=prod
  ├─ workflow_dispatch ► deploy-manual.yml (env + SHA inputs)
  └─ workflow_dispatch ► rollback.yml     (env + previous SHA inputs)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    _deploy-services    _deploy-web     _deploy-landing
    (parallel)          (parallel)      (parallel)
              │               │               │
              ▼               ▼               ▼
         AWS ECR          AWS S3          AWS S3
         (push image)     (sync web)      (sync landing)
              │               │               │
              ▼               ▼               ▼
       App Runner        CloudFront      CloudFront
       (update service)  (invalidate)    (invalidate)
```

### GitHub Environments

| Environment | Mapped branch | GitHub Environment name |
|-------------|--------------|------------------------|
| Development | `develop` | `dev` |
| Production | `main` | `prod` |

Each environment stores one secret and several non-sensitive variables:

| Name | Kind | Description |
|------|------|-------------|
| `AWS_OIDC_ROLE_ARN` | Secret | ARN of the IAM role assumed via OIDC for this environment |
| `AWS_REGION` | Variable | AWS region (e.g. `us-east-1`) |
| `ECR_REPOSITORY_URL` | Variable | ECR repository URL for `services` images |
| `APP_RUNNER_SERVICE_ARN` | Variable | App Runner service ARN for `services` |
| `WEB_S3_BUCKET` | Variable | S3 bucket name for `web` assets |
| `LANDING_S3_BUCKET` | Variable | S3 bucket name for `landing` assets |
| `WEB_CLOUDFRONT_DISTRIBUTION_ID` | Variable | CloudFront distribution ID for `web` |
| `LANDING_CLOUDFRONT_DISTRIBUTION_ID` | Variable | CloudFront distribution ID for `landing` |

### AWS authentication

All AWS interactions use OIDC via `aws-actions/configure-aws-credentials@v4`. Each environment's IAM role trust policy allows `token.actions.githubusercontent.com` as the OIDC provider with a `sub` condition scoped to `repo:sjardon/duck-stack:environment:<env-name>`. No static AWS access keys are stored in the repository or GitHub configuration.

### Per-app deploy behaviour

| App | Build step | AWS target | Post-deploy action |
|-----|-----------|-----------|-------------------|
| `services` | `docker build apps/services` | Push image to ECR tagged with commit SHA; `aws apprunner update-service`; `aws apprunner wait service-running` | Workflow fails if App Runner does not reach `RUNNING` status |
| `web` | `pnpm --filter web build` | `aws s3 sync apps/web/dist/ s3://WEB_S3_BUCKET --delete` | `aws cloudfront create-invalidation --paths "/*"` — failure stops the job |
| `landing` | `pnpm --filter landing build` | `aws s3 sync apps/landing/dist/ s3://LANDING_S3_BUCKET --delete` | `aws cloudfront create-invalidation --paths "/*"` — failure stops the job |

### Concurrency serialization

Every reusable deploy job uses a `concurrency` group keyed to `<app>-<environment>` with `cancel-in-progress: false`. Concurrent deploys to the same environment are serialized (the second run queues rather than interleaves).

### Image tagging

Docker images pushed to ECR are tagged with the full commit SHA. The App Runner service is updated to reference the image at that exact tag. This enables rollbacks to any previously deployed commit by re-running the rollback workflow with that SHA (provided the image is still present in ECR).
