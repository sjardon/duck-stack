# Infrastructure

Living document describing AWS resources, Terraform setup, and CI/CD pipeline for duck-stack. Updated when infrastructure components are added or modified.

---

## AWS resources

Backend runs on App Runner (pulling from ECR). Frontend SPAs are served from private S3 buckets via CloudFront. All backend traffic flows through a shared VPC.

| Component | AWS Resource | Notes |
|-----------|-------------|-------|
| Container registry | ECR | Hosts `apps/services` images. Lifecycle: expire untagged >14 days, keep last 10 tagged. |
| Backend | App Runner | Runs `services` via VPC connector. Auto-deploy disabled; CI/CD triggers updates. |
| `web` static hosting | S3 + CloudFront | Private bucket, OAC-signed requests, 403/404 → `/index.html` for SPA routing. |
| `landing` static hosting | S3 + CloudFront | Same pattern as `web`. |
| Network | VPC + subnets | Private subnets (≥2 AZs) for App Runner; public subnets + IGW. No NAT gateway. |
| IAM | Two roles | Access role (ECR pull for App Runner); instance role (container runtime). |

## Terraform

Three child modules under `infra/terraform/modules/`: `ecr`, `app_runner`, `static_site`. The `static_site` module is instantiated twice (web, landing).

Remote state: S3 bucket (`<project>-terraform-state-<account_id>`) + DynamoDB table (`<project>-terraform-locks`). The `infra/terraform/bootstrap/` module provisions both and is applied once with a local backend before root module init.

All resources carry `project` and `environment` tags via provider `default_tags`. Key outputs: `ecr_repository_url`, `app_runner_service_url`, `web_cloudfront_url`, `landing_cloudfront_url`.

## CI/CD

Push to `develop` → `dev` environment; push to `main` → `prod`. Manual deploy and rollback via `workflow_dispatch`. Authentication uses OIDC (`aws-actions/configure-aws-credentials@v4`); no static keys stored. Concurrent deploys to the same environment queue rather than cancel.

| App | Build | Deploy target | Post-deploy |
|-----|-------|--------------|-------------|
| `services` | `docker build apps/services` | Push to ECR (SHA tag); `apprunner update-service` | Wait for `RUNNING` status |
| `web` | `pnpm --filter web build` | `aws s3 sync dist/ s3://WEB_S3_BUCKET --delete` | CloudFront invalidation |
| `landing` | `pnpm --filter landing build` | `aws s3 sync dist/ s3://LANDING_S3_BUCKET --delete` | CloudFront invalidation |

## Not managed here

- **Database**: Supabase (external PostgreSQL). No RDS provisioned.
- **Custom domains / SSL**: deferred to a future feature.
