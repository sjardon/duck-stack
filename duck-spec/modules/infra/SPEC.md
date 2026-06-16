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

## AWS Base Infrastructure (INFRA-002)

The `infra/terraform/` directory contains a modular Terraform project that provisions the foundational AWS infrastructure required to run the `services` backend.

### Directory structure

```
infra/terraform/
  bootstrap/          # One-time setup: S3 bucket + DynamoDB table for remote state
  modules/
    vpc/              # VPC, subnets, IGW, route tables
    ecr/              # ECR repository with lifecycle policy
    app_runner/       # App Runner service, VPC connector, IAM roles
  main.tf             # Root module: backend config, provider, module calls
  variables.tf        # Root input variables
  outputs.tf          # ECR URL, App Runner URL, VPC ID
  terraform.tfvars.example
```

### Remote backend

Terraform state is stored in an S3 bucket (`<project>-terraform-state-<account_id>`) with versioning and AES-256 server-side encryption enabled. A DynamoDB table (`<project>-terraform-locks`) provides state locking via the `LockID` hash key, preventing concurrent `terraform apply` runs from corrupting state. The bootstrap module creates both resources and must be applied once with a local backend before the root module's `backend "s3"` block is initialised.

### VPC

The VPC module provisions a `aws_vpc` with DNS hostnames and DNS resolution enabled, an internet gateway, public subnets (one per availability zone, with auto-assigned public IPs), private subnets (one per AZ, no public IP), and a public route table with a default route to the internet gateway. A minimum of two availability zones is required. No NAT gateway is provisioned — App Runner uses the VPC connector for inbound VPC access while its public endpoint is managed by App Runner itself.

### ECR

The ECR module provisions an `aws_ecr_repository` with image scanning on push enabled. An `aws_ecr_lifecycle_policy` expires untagged images older than 14 days and retains only the last `lifecycle_policy_count` (default 10) tagged images. Outputs expose the repository URL and ARN.

### App Runner

The App Runner module provisions the full runtime stack for `services`:

- **IAM — instance role** (`app_runner_instance_role`): trusted by `tasks.apprunner.amazonaws.com` with `AWSAppRunnerServicePolicyForECRAccess` attached, granting runtime ECR access.
- **IAM — access role** (`app_runner_access_role`): trusted by `build.apprunner.amazonaws.com` with `AWSAppRunnerServicePolicyForECRAccess` attached, allowing App Runner to pull images from ECR during service build.
- **VPC connector**: attached to the private subnets from the VPC module, wiring the App Runner service into the VPC.
- **App Runner service**: pulls the `services` image from ECR using the access role, runs with the instance role, connects to the VPC via the connector. `auto_deployments_enabled = false`; deployments are triggered externally (CI/CD pipeline, INFRA-004). An empty ECR repository does not block `terraform apply`.

### Resource tagging

The AWS provider `default_tags` block at the root module level applies `project` and `environment` tags to every provisioned resource automatically.

### Root outputs

| Output | Value |
|--------|-------|
| `ecr_repository_url` | URL of the ECR repository for `services` images |
| `app_runner_service_url` | Public HTTPS URL of the App Runner service |
| `vpc_id` | ID of the provisioned VPC |

---

## Static Hosting — S3 + CloudFront (INFRA-003)

The `infra/terraform/` project includes a reusable `modules/static_site` module that provisions private S3-backed CloudFront distributions. The root configuration instantiates this module twice: once for `web` and once for `landing`.

### Module: `modules/static_site`

The module accepts three input variables — `project`, `environment`, and `app_name` — and provisions the following resources per instance:

| Resource | Purpose |
|----------|---------|
| `aws_s3_bucket.main` | Private bucket named `<project>-<environment>-<app_name>`. Holds the Vite-built static assets. |
| `aws_s3_bucket_public_access_block.main` | Blocks all four public-access flags (`block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets`). The bucket is never directly accessible from the internet. |
| `aws_cloudfront_origin_access_control.main` | OAC with `signing_behavior = "always"` and `signing_protocol = "sigv4"`. Signs every request from CloudFront to S3 with SigV4 credentials. |
| `aws_cloudfront_distribution.main` | Distribution whose origin points to the bucket's regional domain name via the OAC. `viewer_protocol_policy = "redirect-to-https"`. `default_root_object = "index.html"`. Two `custom_error_response` blocks map HTTP 403 and 404 from S3 to `/index.html` with response status 200, enabling client-side React Router to resolve deep links. |
| `aws_s3_bucket_policy.main` | Bucket policy granting `s3:GetObject` to the `cloudfront.amazonaws.com` service principal conditioned on `aws:SourceArn` matching the specific distribution ARN. All other principals are denied. |

### Module instances

| Module call | `app_name` | Serves |
|-------------|-----------|--------|
| `module.static_site_web` | `web` | `apps/web` SPA |
| `module.static_site_landing` | `landing` | `apps/landing` SPA |

### SPA routing fallback

When a user requests a deep link (e.g. `/dashboard/settings`) that does not correspond to a real S3 object, S3 returns a 403. CloudFront intercepts this response and replaces it with `/index.html` at HTTP 200, allowing React Router to resolve the route on the client without a server round-trip.

### Root outputs

Two additional outputs are exposed at the root Terraform level:

| Output | Value |
|--------|-------|
| `web_cloudfront_url` | CloudFront distribution domain name for the `web` application |
| `landing_cloudfront_url` | CloudFront distribution domain name for the `landing` application |

### Directory structure addition

```
infra/terraform/
  modules/
    static_site/        # Reusable module: S3 bucket + OAC + CloudFront distribution + bucket policy
      main.tf
      variables.tf
      outputs.tf
```
