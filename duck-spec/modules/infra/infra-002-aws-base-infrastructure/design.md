# INFRA-002 — AWS Base Infrastructure (Terraform): Design

## Problem statement

The monorepo (INFRA-001) has no cloud infrastructure. The `services` backend must run on AWS as a Docker container with Supabase as the external database. This feature provisions the foundational AWS infrastructure using Terraform: a VPC, an ECR repository for the `services` image, an App Runner service wired into the VPC via a VPC connector, and the IAM roles required to pull images and run the service. Remote state with S3 and DynamoDB locking must be in place before any other environment-facing infrastructure is added.

## Alternatives

| # | Name | Description | Decision |
|---|------|-------------|----------|
| 1 | Flat single-file Terraform | All resources defined in a single `main.tf` with no module abstraction. Simple to write initially but violates R001 (reusable modules) and becomes unmaintainable when INFRA-003 and INFRA-004 extend the infrastructure. | Not chosen — fails R001 and long-term maintainability constraint. |
| 2 | Terraform with child modules + local backend | Reusable child modules (`vpc`, `ecr`, `app_runner`) called from a root module, but state stored locally. Satisfies R001, R004–R008 but cannot satisfy R002, R003, NF001 (remote backend with locking). | Not chosen — fails R002, R003, NF001. |
| 3 | Terraform with child modules + S3/DynamoDB remote backend (bootstrap script) | Reusable child modules under `infra/terraform/modules/`, a root module that wires them together, and a one-time bootstrap step that creates the S3 bucket and DynamoDB table before the first `terraform init`. Satisfies all R-IDs and NF-IDs. | Chosen. |

## Chosen solution

**Terraform with child modules + S3/DynamoDB remote backend (bootstrap script)**

This approach organises infrastructure into three reusable child modules (`vpc`, `ecr`, `app_runner`) each with their own `variables.tf`, `main.tf`, and `outputs.tf`. A root module wires the three child modules together and declares all cross-cutting values (project name, environment, AWS region, CIDR blocks, ECR image tag). A separate, self-contained bootstrap module provisions the S3 bucket and DynamoDB table that Terraform itself needs before the first `terraform init`. All resources carry `project` and `environment` tags enforced at the root level via `default_tags` on the AWS provider.

This is the only alternative that satisfies R001–R009, NF001–NF002, and all four edge cases without requiring out-of-scope tooling (e.g., Terragrunt or Pulumi).

## Technical design

### Directory layout

```
infra/
  terraform/
    bootstrap/
      main.tf          # S3 bucket + DynamoDB table only — run once manually
      variables.tf
      outputs.tf
    modules/
      vpc/
        main.tf
        variables.tf
        outputs.tf
      ecr/
        main.tf
        variables.tf
        outputs.tf
      app_runner/
        main.tf
        variables.tf
        outputs.tf
    main.tf            # Root module: backend config, provider, module calls
    variables.tf       # Root variables
    outputs.tf         # Root outputs (ECR URL, App Runner URL, VPC ID)
    terraform.tfvars.example
```

### Remote backend (bootstrap)

The bootstrap module creates:
- An S3 bucket (`<project>-terraform-state-<account_id>`) with versioning enabled and server-side encryption (AES-256).
- A DynamoDB table (`<project>-terraform-locks`) with a `LockID` string hash key.

The bootstrap module is applied **once** with a local backend, then the root module references the resulting bucket and table in its `backend "s3"` block.

### VPC module

Inputs: `project`, `environment`, `vpc_cidr`, `public_subnet_cidrs` (list, one per AZ), `private_subnet_cidrs` (list, one per AZ), `availability_zones` (list, minimum 2).

Resources:
- `aws_vpc` — DNS hostnames and DNS resolution enabled.
- `aws_internet_gateway` — attached to VPC.
- `aws_subnet` (public) — one per AZ, `map_public_ip_on_launch = true`.
- `aws_subnet` (private) — one per AZ, no public IP.
- `aws_route_table` (public) — default route to IGW.
- `aws_route_table_association` — each public subnet to public route table.

Outputs: `vpc_id`, `public_subnet_ids`, `private_subnet_ids`.

Note: no NAT gateway is provisioned. App Runner with a VPC connector uses the private subnets for outbound VPC access; the service's public endpoint is managed by App Runner itself.

### ECR module

Inputs: `project`, `environment`, `repository_name`, `image_tag_mutability` (default `MUTABLE`), `lifecycle_policy_count` (default `10`).

Resources:
- `aws_ecr_repository` — image scanning on push enabled, tag mutability configurable.
- `aws_ecr_lifecycle_policy` — expire untagged images older than 14 days; keep only the last `lifecycle_policy_count` tagged images.

Outputs: `repository_url`, `repository_arn`.

Edge case EC001: the App Runner service definition references the repository URL with a placeholder image tag. `terraform apply` does not push an image; the App Runner service is created in a `CREATE_FAILED` or paused state until a real image is pushed and the service is deployed (handled via CI/CD in INFRA-004). No `aws_apprunner_service` resource depends on an actual image digest.

### App Runner module

Inputs: `project`, `environment`, `service_name`, `ecr_repository_url`, `image_tag` (default `latest`), `vpc_id`, `private_subnet_ids`, `cpu` (default `"1 vCPU"`), `memory` (default `"2 GB"`), `port` (default `3000`), `environment_variables` (map of strings, default `{}`).

Resources:

**IAM**
- `aws_iam_role` (`app_runner_instance_role`) — trusted by `tasks.apprunner.amazonaws.com`. Allows App Runner to assume the role for the running instance.
- `aws_iam_role_policy_attachment` — attaches `AWSAppRunnerServicePolicyForECRAccess` (AWS managed policy). This policy includes `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` (EC004).
- `aws_iam_role` (`app_runner_access_role`) — trusted by `build.apprunner.amazonaws.com`. Used by App Runner to pull images from ECR during build.
- `aws_iam_role_policy_attachment` — attaches `AWSAppRunnerServicePolicyForECRAccess` to the access role as well.

**Networking**
- `aws_apprunner_vpc_connector` — uses `private_subnet_ids` from the VPC module. Security group allows all outbound traffic (App Runner manages inbound). Edge case EC003: outputs include the VPC connector ARN so misconfiguration is visible.

**Service**
- `aws_apprunner_service` — image repository type `ECR`, uses `access_role_arn` for image pull, uses `instance_role_arn` for runtime, references VPC connector. `auto_deployments_enabled = false` (CI/CD in INFRA-004 controls deployments).

Outputs: `service_url`, `service_arn`, `vpc_connector_arn`.

### Root module

`variables.tf` declares: `project`, `environment`, `aws_region`, `vpc_cidr`, `public_subnet_cidrs`, `private_subnet_cidrs`, `availability_zones`, `ecr_repository_name`, `app_runner_service_name`, `app_runner_image_tag`, `app_runner_port`, `app_runner_environment_variables`.

`main.tf`:
- `terraform` block with `required_providers` (hashicorp/aws >= 5.0) and `backend "s3"` with bucket, key, region, dynamodb_table, encrypt = true.
- `provider "aws"` with `default_tags { tags = { project = var.project, environment = var.environment } }`.
- `module "vpc"` calling `./modules/vpc`.
- `module "ecr"` calling `./modules/ecr`.
- `module "app_runner"` calling `./modules/app_runner`, passing `vpc_id` and `private_subnet_ids` from `module.vpc`, `ecr_repository_url` from `module.ecr`.

`outputs.tf` exposes: `ecr_repository_url` (from `module.ecr`), `app_runner_service_url` (from `module.app_runner`), `vpc_id` (from `module.vpc`). Satisfies R009.

`terraform.tfvars.example` provides non-sensitive example values so contributors know what to supply.

### Resource tagging strategy

The AWS provider `default_tags` block at the root module level applies `project` and `environment` tags to every resource automatically (NF002). Individual modules do not need to repeat tag blocks — the provider merges them. This ensures no resource escapes the tagging convention.

### State locking (NF001 / EC002)

The `backend "s3"` block specifies `dynamodb_table`. Terraform acquires a lock entry in DynamoDB before any write operation. A concurrent `terraform apply` from a second machine will receive a lock conflict error and abort without corrupting state.

## Files

| Path | Action |
|------|--------|
| `infra/terraform/bootstrap/main.tf` | CREATE |
| `infra/terraform/bootstrap/variables.tf` | CREATE |
| `infra/terraform/bootstrap/outputs.tf` | CREATE |
| `infra/terraform/modules/vpc/main.tf` | CREATE |
| `infra/terraform/modules/vpc/variables.tf` | CREATE |
| `infra/terraform/modules/vpc/outputs.tf` | CREATE |
| `infra/terraform/modules/ecr/main.tf` | CREATE |
| `infra/terraform/modules/ecr/variables.tf` | CREATE |
| `infra/terraform/modules/ecr/outputs.tf` | CREATE |
| `infra/terraform/modules/app_runner/main.tf` | CREATE |
| `infra/terraform/modules/app_runner/variables.tf` | CREATE |
| `infra/terraform/modules/app_runner/outputs.tf` | CREATE |
| `infra/terraform/main.tf` | CREATE |
| `infra/terraform/variables.tf` | CREATE |
| `infra/terraform/outputs.tf` | CREATE |
| `infra/terraform/terraform.tfvars.example` | CREATE |

## Requirement coverage

| ID | Design decision that satisfies it |
|----|----------------------------------|
| R001 | Three child modules (`vpc`, `ecr`, `app_runner`) each with their own `variables.tf`, `main.tf`, `outputs.tf`; root module wires them. |
| R002 | Root `main.tf` `backend "s3"` block with bucket, key, region, encrypt = true. |
| R003 | `backend "s3"` block includes `dynamodb_table` for state locking. |
| R004 | `vpc` module provisions `aws_vpc`, public and private `aws_subnet` resources across `availability_zones` list (minimum 2 entries), IGW, and route tables. |
| R005 | `ecr` module provisions `aws_ecr_repository` with lifecycle policy. |
| R006 | `app_runner` module provisions `aws_apprunner_service` referencing the ECR repository URL. |
| R007 | `app_runner` module provisions `aws_apprunner_vpc_connector` using private subnet IDs from the VPC module; the service's `network_configuration` block references the connector ARN. |
| R008 | `app_runner` module provisions `aws_iam_role` for instance and access roles, both with `AWSAppRunnerServicePolicyForECRAccess` attached. |
| R009 | Root `outputs.tf` exposes `ecr_repository_url`, `app_runner_service_url`, `vpc_id`. |
| NF001 | DynamoDB table referenced in `backend "s3"` block; Terraform acquires/releases lock per operation. |
| NF002 | AWS provider `default_tags` block applies `project` and `environment` tags to all resources automatically. |
| EC001 | `aws_apprunner_service` is configured with `auto_deployments_enabled = false`; no lifecycle dependency on an actual pushed image, so `terraform apply` completes even with an empty ECR repository. |
| EC002 | DynamoDB locking (R003/NF001) rejects concurrent writes with a lock conflict error. |
| EC003 | VPC connector ARN is exposed as a root output so misconfiguration is surfaced via `terraform output`. |
| EC004 | Both IAM roles attach `AWSAppRunnerServicePolicyForECRAccess`, which includes `ecr:GetAuthorizationToken` and image pull permissions; missing permissions cause an explicit App Runner deployment failure. |
