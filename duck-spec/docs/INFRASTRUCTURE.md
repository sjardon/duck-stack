# Infrastructure

Living document describing AWS resources, Terraform setup, and CI/CD pipeline for duck-stack. Updated when infrastructure components are added or modified.

---

## AWS resources

> **Backend compute superseded (INFRA-008).** The design below (ECR + App Runner + VPC) was never applied and is no longer the backend's deploy target — `services` now runs on DigitalOcean App Platform, see "DigitalOcean App Platform" below. It remains documented here because the underlying Terraform is still versioned in the repository pending its removal (INFRA-010), and because it still describes `web`/`landing` static hosting until INFRA-009 migrates them.

Frontend SPAs are served from private S3 buckets via CloudFront. All backend traffic (as originally designed, unapplied) flowed through a shared VPC.

| Component | AWS Resource | Notes |
|-----------|-------------|-------|
| Container registry | ECR | Hosts `apps/services` images. Lifecycle: expire untagged >14 days, keep last 10 tagged. Unapplied; superseded for backend deploy by INFRA-008. |
| Backend (superseded) | App Runner | Originally designed to run `services` via VPC connector; never applied. Backend now deploys to DigitalOcean App Platform (INFRA-008). |
| `web` static hosting | S3 + CloudFront | Private bucket, OAC-signed requests, 403/404 → `/index.html` for SPA routing. Pending migration to Cloudflare Pages (INFRA-009). |
| `landing` static hosting | S3 + CloudFront | Same pattern as `web`. Pending migration to Cloudflare Pages (INFRA-009). |
| Network | VPC + subnets | Private subnets (≥2 AZs) for App Runner; public subnets + IGW. No NAT gateway. Unapplied. |
| IAM | Two roles | Access role (ECR pull for App Runner); instance role (container runtime). Unapplied. |

## DigitalOcean App Platform

The `services` backend deploys to DigitalOcean App Platform (INFRA-008), not AWS. A single versioned specification, `.do/app.yaml`, declares one `service` component built from `apps/services/Dockerfile` with the monorepo root as Docker build context. Every environment-dependent value — app name, GitHub branch, and the 19 runtime environment variables the backend reads — is an `${VAR}` placeholder; the same specification structure serves every environment. Secret-classified variables (database connection string, Clerk keys, Mobbex credentials) are declared `type: secret`; their real values live only in a local, git-ignored `.do/.env.deploy.<environment>` file, never in the repository.

The platform HTTP port, the health-check port, and the container's `PORT` variable all resolve from the same `${PORT}` placeholder, so they cannot diverge; the health check probes the backend's existing `GET /health` endpoint.

Deploys are manual and repeatable: `.do/deploy.sh <values-file>` renders `.do/app.yaml` with `envsubst` and reconciles the application with `doctl apps create --spec <rendered> --upsert --wait`, which creates the app on the first run and updates it in place (keyed by the `name` field) on every later run, printing the resulting public HTTPS URL. `.do/README.md` documents the full procedure, including that console edits are overwritten by the next run and the command to scale the app down (it does not scale to zero). Automatic deploy on push/merge and rollback are not implemented here (INFRA-012).

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
