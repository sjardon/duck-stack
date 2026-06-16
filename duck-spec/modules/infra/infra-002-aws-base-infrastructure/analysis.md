# INFRA-002 — AWS Base Infrastructure (Terraform)

## Reason for being

The monorepo is already scaffolded (INFRA-001) but no cloud infrastructure exists yet. The backend service (`services`) must run on AWS as a Docker container, while the database is provided externally by Supabase (no RDS required) and static frontend hosting is deferred to a later feature.

The objective is to provision the base AWS infrastructure with Terraform: a VPC, an ECR repository to host the `services` Docker images, and an App Runner service to run the backend, including the IAM roles and policies it needs.

## Scope

Terraform project structure with reusable modules, input variables, and a remote backend on S3 with state locking on DynamoDB. VPC with public and private subnets. ECR repository for the `services` container image. App Runner service connected to that VPC via a VPC connector. IAM roles and policies for App Runner. Resource tagging conventions (project, environment).

## Out of scope

- Hosting of `web` and `landing` (S3 + CloudFront — INFRA-003).
- CI/CD pipeline (INFRA-004).
- Custom domain names and SSL certificates.
- Multiple environments — this feature provisions a single environment.
- Database resources in AWS — Supabase is external.

## Functional requirements

| ID   | Requirement |
|------|-------------|
| R001 | The system shall provide a Terraform project structure organized into reusable modules with explicit input variables. |
| R002 | The system shall configure a remote Terraform backend that stores state in an S3 bucket. |
| R003 | The system shall configure state locking via a DynamoDB table to prevent concurrent Terraform runs from corrupting state. |
| R004 | The system shall provision a VPC containing both public and private subnets across at least two availability zones. |
| R005 | The system shall provision an ECR repository to host Docker images for the `services` application. |
| R006 | The system shall provision an AWS App Runner service that runs the `services` container image from the ECR repository. |
| R007 | The system shall connect the App Runner service to the VPC through a VPC connector so the service runs inside the provisioned network. |
| R008 | The system shall provision the IAM roles and policies required by App Runner to pull images from ECR and execute the service. |
| R009 | The system shall expose Terraform outputs for the ECR repository URL, App Runner service URL, and VPC ID. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NF001 | The Terraform state stored in S3 shall be protected against concurrent writes via DynamoDB-based state locking. |
| NF002 | Every provisioned AWS resource shall be tagged with at least a `project` tag and an `environment` tag. |

## Edge cases

| ID    | Edge case |
|-------|-----------|
| EC001 | If the ECR repository is empty when App Runner is first created, the Terraform apply must not fail — the service definition shall be reconcilable once an image is pushed. |
| EC002 | If a `terraform apply` is run concurrently from two machines, the DynamoDB lock shall reject the second run instead of corrupting the state. |
| EC003 | If the VPC connector or its subnets are misconfigured, the App Runner service shall surface the failure via Terraform output rather than silently degrading. |
| EC004 | If the IAM role for App Runner lacks `ecr:GetAuthorizationToken` or image pull permissions, the App Runner deployment must fail explicitly so the missing permission is detectable. |

## Technical constraints

- IaC: Terraform
- Cloud provider: AWS
- Container orchestration: AWS App Runner
- Container registry: AWS ECR
- Networking: VPC with a VPC connector wiring App Runner to private subnets
- Database: Supabase (external, not managed here)
- Remote state: S3 bucket + DynamoDB table for locking

## Dependencies

- INFRA-001 — the `services` application must exist in the monorepo before its container can be built and deployed.

## Effort estimate

**high** — 9 functional requirements, NFRs covering security (state locking) and operational tagging, 4 edge cases. Combination of VPC, ECR, App Runner with VPC connector, IAM, and remote backend with locking.
