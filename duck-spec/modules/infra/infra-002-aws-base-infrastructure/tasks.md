# INFRA-002 — AWS Base Infrastructure (Terraform): Tasks

## T001 — Create bootstrap `variables.tf`

In `infra/terraform/bootstrap/variables.tf`, declare input variables: `project` (string), `aws_region` (string, default `"us-east-1"`), `aws_account_id` (string).

Covers: R002, R003

---

## T002 — Create bootstrap `main.tf`

In `infra/terraform/bootstrap/main.tf`, define the `terraform` block with `required_providers` (hashicorp/aws >= 5.0) and a `local` backend. Define the `aws` provider with `region = var.aws_region`. Provision `aws_s3_bucket` (`<project>-terraform-state-<account_id>`) with versioning enabled and server-side AES-256 encryption. Provision `aws_dynamodb_table` (`<project>-terraform-locks`) with `LockID` string hash key and `PAY_PER_REQUEST` billing mode.

Covers: R002, R003, NF001

---

## T003 — Create bootstrap `outputs.tf`

In `infra/terraform/bootstrap/outputs.tf`, output `state_bucket_name` (the S3 bucket id) and `locks_table_name` (the DynamoDB table name). These values are referenced when configuring the root module backend.

Covers: R002, R003

---

## T004 — Create VPC module `variables.tf`

In `infra/terraform/modules/vpc/variables.tf`, declare: `project` (string), `environment` (string), `vpc_cidr` (string), `public_subnet_cidrs` (list of string), `private_subnet_cidrs` (list of string), `availability_zones` (list of string, minimum length 2 enforced via validation block).

Covers: R001, R004

---

## T005 — Create VPC module `main.tf`

In `infra/terraform/modules/vpc/main.tf`, provision `aws_vpc` with DNS hostnames and DNS resolution enabled. Provision `aws_internet_gateway` attached to the VPC. Using `for_each` over `var.availability_zones`, provision one public `aws_subnet` per AZ (`map_public_ip_on_launch = true`) and one private `aws_subnet` per AZ. Provision one `aws_route_table` for public subnets with a default route to the IGW. Associate each public subnet with the public route table via `aws_route_table_association`.

Covers: R001, R004

---

## T006 — Create VPC module `outputs.tf`

In `infra/terraform/modules/vpc/outputs.tf`, output `vpc_id` (the VPC resource id), `public_subnet_ids` (list of public subnet ids), and `private_subnet_ids` (list of private subnet ids).

Covers: R001, R004, R007, R009

---

## T007 — Create ECR module `variables.tf`

In `infra/terraform/modules/ecr/variables.tf`, declare: `project` (string), `environment` (string), `repository_name` (string), `image_tag_mutability` (string, default `"MUTABLE"`), `lifecycle_policy_count` (number, default `10`).

Covers: R001, R005

---

## T008 — Create ECR module `main.tf`

In `infra/terraform/modules/ecr/main.tf`, provision `aws_ecr_repository` with `image_tag_mutability = var.image_tag_mutability` and `image_scanning_configuration { scan_on_push = true }`. Provision `aws_ecr_lifecycle_policy` attached to the repository: expire untagged images older than 14 days (rule priority 1) and keep only the last `var.lifecycle_policy_count` tagged images (rule priority 2). The repository resource must not have a lifecycle dependency on any pushed image so that `terraform apply` succeeds on an empty repository (EC001).

Covers: R001, R005, EC001

---

## T009 — Create ECR module `outputs.tf`

In `infra/terraform/modules/ecr/outputs.tf`, output `repository_url` (the full ECR repository URL) and `repository_arn`.

Covers: R001, R005, R009

---

## T010 — Create App Runner module `variables.tf`

In `infra/terraform/modules/app_runner/variables.tf`, declare: `project` (string), `environment` (string), `service_name` (string), `ecr_repository_url` (string), `image_tag` (string, default `"latest"`), `vpc_id` (string), `private_subnet_ids` (list of string), `cpu` (string, default `"1 vCPU"`), `memory` (string, default `"2 GB"`), `port` (number, default `3000`), `environment_variables` (map of string, default `{}`).

Covers: R001, R006, R007, R008

---

## T011 — Create App Runner module IAM resources in `main.tf` (part 1 of 2)

In `infra/terraform/modules/app_runner/main.tf`, define the IAM resources. Provision `aws_iam_role` named `app_runner_access_role` trusted by principal `build.apprunner.amazonaws.com` and attach the AWS managed policy `AWSAppRunnerServicePolicyForECRAccess`. Provision `aws_iam_role` named `app_runner_instance_role` trusted by principal `tasks.apprunner.amazonaws.com` and attach the same managed policy. These two roles cover image-pull permissions (EC004) and runtime permissions (R008).

Covers: R001, R008, EC004

---

## T012 — Create App Runner module VPC connector and service in `main.tf` (part 2 of 2)

In `infra/terraform/modules/app_runner/main.tf` (continuing from T011), provision `aws_apprunner_vpc_connector` using `var.private_subnet_ids` (EC003). Provision `aws_apprunner_service` with: image repository type `ECR`, `image_identifier = "${var.ecr_repository_url}:${var.image_tag}"`, `access_role_arn` set to the access role ARN, `instance_configuration` using `instance_role_arn`, `cpu`, `memory`, `network_configuration` referencing the VPC connector ARN (R007), `health_check_configuration` on the specified port, runtime `environment_variables` from `var.environment_variables`, and `auto_deployments_enabled = false` (EC001).

Covers: R001, R006, R007, EC001, EC003

---

## T013 — Create App Runner module `outputs.tf`

In `infra/terraform/modules/app_runner/outputs.tf`, output `service_url` (the App Runner service URL), `service_arn`, and `vpc_connector_arn` (EC003 — exposes connector ARN for diagnostic visibility).

Covers: R001, R006, R009, EC003

---

## T014 — Create root `variables.tf`

In `infra/terraform/variables.tf`, declare all root-level variables: `project` (string), `environment` (string), `aws_region` (string, default `"us-east-1"`), `vpc_cidr` (string, default `"10.0.0.0/16"`), `public_subnet_cidrs` (list of string), `private_subnet_cidrs` (list of string), `availability_zones` (list of string), `ecr_repository_name` (string, default `"services"`), `app_runner_service_name` (string), `app_runner_image_tag` (string, default `"latest"`), `app_runner_port` (number, default `3000`), `app_runner_environment_variables` (map of string, default `{}`).

Covers: R001

---

## T015 — Create root `main.tf`

In `infra/terraform/main.tf`, define the `terraform` block with `required_providers` (hashicorp/aws >= 5.0) and `backend "s3"` specifying bucket, key (`terraform/state`), region, `dynamodb_table`, and `encrypt = true` (R002, R003, NF001). Define the `aws` provider with `region = var.aws_region` and `default_tags { tags = { project = var.project, environment = var.environment } }` (NF002). Call `module "vpc"` from `./modules/vpc`, `module "ecr"` from `./modules/ecr`, and `module "app_runner"` from `./modules/app_runner` passing `module.vpc.vpc_id`, `module.vpc.private_subnet_ids`, and `module.ecr.repository_url` as inputs.

Covers: R001, R002, R003, R004, R005, R006, R007, R008, NF001, NF002

---

## T016 — Create root `outputs.tf`

In `infra/terraform/outputs.tf`, output `ecr_repository_url` (from `module.ecr.repository_url`), `app_runner_service_url` (from `module.app_runner.service_url`), and `vpc_id` (from `module.vpc.vpc_id`).

Covers: R009

---

## T017 — Create `terraform.tfvars.example`

In `infra/terraform/terraform.tfvars.example`, provide example non-sensitive values for all root variables: sample project name (`duck-stack`), environment (`staging`), region (`us-east-1`), two-AZ CIDR examples for public and private subnets, default ECR repository name (`services`), App Runner service name, port (`3000`), and an empty environment_variables map. Add a comment at the top explaining that contributors must copy this file to `terraform.tfvars` and fill in their values before running `terraform init`.

Covers: R001
