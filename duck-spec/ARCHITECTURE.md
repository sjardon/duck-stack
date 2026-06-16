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
- **Frontend hosting**: `apps/web` and `apps/landing` hosting (S3 + CloudFront) is deferred to INFRA-003.
- **Custom domains / SSL**: deferred to a future feature.
- **CI/CD pipeline**: deferred to INFRA-004.
