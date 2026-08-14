# INFRA-010 — AWS infrastructure retirement — Analysis

## Reason for being

With the backend running on DigitalOcean App Platform (INFRA-008) and both SPAs served from Cloudflare Pages (INFRA-009), no component of the system depends on AWS any more. Yet the repository still versions the full Terraform project — root module, `bootstrap/`, and the `vpc`, `ecr`, `app_runner` and `static_site` child modules — plus six GitHub Actions workflows (`deploy.yml`, `deploy-manual.yml`, `rollback.yml` and the three reusable `_deploy-*.yml`) that authenticate against AWS through OIDC and publish to ECR, S3 and CloudFront. `deploy.yml` still triggers on every push to `develop` and `main`, so every merge fires a run that can only fail, producing permanent noise.

The living documentation compounds the problem: `duck-spec/docs/INFRASTRUCTURE.md` and `duck-spec/modules/infra/SPEC.md` still describe the AWS topology (with "superseded, pending removal" caveats), and `duck-spec/docs/SPEC.md` still points at it. Six feature entries (INFRA-002/003/004 in `DONE`, INFRA-005/006/007 in `TODO`) document infrastructure that was never applied and will never be built.

The goal is to remove every AWS infrastructure definition and every piece of AWS automation from the repository, realign the living documentation with the real topology, and record in the feature registry why each abandoned piece was dropped and what replaces it.

## Scope

Deletion of the `infra/terraform/` tree and of the GitHub Actions workflows that deploy against AWS, so that merges to `develop` and `main` no longer trigger failing runs. Realignment of the living infrastructure documentation so it describes only the current topology (App Platform + Cloudflare Pages). Deprecation — not deletion — of the six AWS feature entries in `duck-spec/modules/infra/FEATURES.md`, each carrying the reason it was abandoned and, where the underlying need persists, the feature that now covers it. Removal of the repository configuration values that only existed to address AWS resources, while explicitly preserving the ones the backend code still reads at runtime.

## Out of scope

- The replacement CI/CD pipeline over DigitalOcean and Cloudflare (INFRA-012): after this feature no automatic deploy exists, and deploys remain the documented manual procedures of INFRA-008 and INFRA-009.
- Migration of email delivery off SES (NOTIFICATIONS-002) and of observability/alerting (INFRA-011).
- Decommissioning resources in the AWS account: nothing was ever applied, so there is nothing to destroy.
- Any change to the application source code under `apps/` and `packages/`.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall contain no AWS infrastructure definition in the repository: the `infra/terraform/` tree — root module (`main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`), `bootstrap/`, and the `vpc`, `ecr`, `app_runner` and `static_site` child modules — shall not be present after the change. |
| R002 | Event-driven | WHEN a commit is pushed to `develop` or `main`, the system shall trigger no workflow run that authenticates against AWS or publishes to ECR, S3 or CloudFront. |
| R003 | Ubiquitous | The system shall contain no workflow definition that references AWS authentication or AWS services, including the manually dispatched ones (`deploy-manual.yml`, `rollback.yml`), so that no AWS deploy path remains reachable by any trigger. |
| R004 | Ubiquitous | The system shall describe in `duck-spec/docs/INFRASTRUCTURE.md` only the topology in force — DigitalOcean App Platform for `services` and Cloudflare Pages for `web` and `landing` — with the AWS resources, Terraform and AWS CI/CD sections removed rather than annotated as superseded. |
| R005 | Ubiquitous | The system shall describe in `duck-spec/modules/infra/SPEC.md` and in `duck-spec/docs/SPEC.md` only the infrastructure that exists, with no section or status line presenting the AWS design as built, planned or pending removal. |
| R006 | Ubiquitous | The system shall state in `duck-spec/docs/ARCHITECTURE.md` a deployment topology that names no AWS deploy target, including the residual comparative references to the previously planned App Runner URL. |
| R007 | Event-driven | WHEN the AWS infrastructure is removed, the system shall set the feature entries that describe AWS infrastructure already given as built (INFRA-002, INFRA-003, INFRA-004) to `DEPRECATED`, each recording the reason it was abandoned. |
| R008 | Event-driven | WHEN the AWS infrastructure is removed, the system shall set the pending AWS infrastructure feature entries (INFRA-005, INFRA-006, INFRA-007) to `DEPRECATED`, each naming the feature that replaces it. |
| R009 | Ubiquitous | The system shall remove the repository configuration variables and values whose only purpose was to address AWS resources — the Terraform variable set and example values, and the workflow-level AWS secrets and variables (`AWS_OIDC_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `WEB_S3_BUCKET`, `LANDING_S3_BUCKET`, `WEB_CLOUDFRONT_DISTRIBUTION_ID`, `LANDING_CLOUDFRONT_DISTRIBUTION_ID` and equivalents) — together with the infrastructure they addressed. |
| R010 | Conditional | IF a configuration value that names an AWS service is still read by application code that remains in place (`SES_REGION` and `EMAIL_SENDER_ADDRESS` in `.do/app.yaml`, consumed by `resolveNotifier()` at startup), THEN the system shall keep that value declared and documented as inert until NOTIFICATIONS-002 replaces the adapter. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | After the change, a full-text search over the living documentation (`duck-spec/docs/*.md`, `duck-spec/modules/*/SPEC.md`) and over `.github/workflows/` shall return no reference to Terraform, VPC, ECR, App Runner, S3 buckets, CloudFront distributions, DynamoDB locks or AWS OIDC roles, except the SES-related mentions that NOTIFICATIONS-002 owns and that are explicitly flagged as pending migration. |
| NF002 | Every deprecated feature entry shall remain readable in `FEATURES.md` with its original content intact and shall state, in its own body, why the piece was abandoned and — where applicable — which feature covers the need instead, so the decision can be reconstructed from the registry alone without consulting git history. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the Terraform tree is deleted, the remote state bucket and the DynamoDB lock table described in `bootstrap/` were never created and no `terraform apply` was ever run; the system shall delete the tree directly, execute no `terraform destroy` and no state migration step, and record in the deprecation notes of INFRA-002 and INFRA-003 that no state backend and no AWS resource ever existed, so no orphaned-resource cleanup is expected afterwards. Assumption: the "never applied" claim already asserted by `INFRASTRUCTURE.md` and `modules/infra/SPEC.md` is taken as accurate; if any resource turns out to exist, its removal is outside this feature. |
| EC002 | WHEN feature entries currently in `DONE` (INFRA-002, INFRA-003, INFRA-004) are switched to `DEPRECATED`, a reader could infer that working functionality was withdrawn; the system shall include in each of those entries an explicit statement that the infrastructure was defined but never applied and never operated, and shall delete their corresponding sections from `duck-spec/modules/infra/SPEC.md` instead of leaving them described as implemented state. |
| EC003 | WHEN INFRA-005, INFRA-006 and INFRA-007 are deprecated, their content describes needs that remain valid (email delivery, delivery metrics, alerting); the system shall name in each entry the feature that now carries the need — NOTIFICATIONS-002 for email delivery, INFRA-011 for delivery observability and alerting — so that deprecation removes the AWS implementation and not the requirement. |
| EC004 | WHEN AWS infrastructure is removed while `apps/services` still declares `@aws-sdk/client-sesv2` and ships `sesEmailNotifier.ts`, the system shall leave that dependency, its source file, its tests and its `SES_REGION` / `EMAIL_SENDER_ADDRESS` entries in `.do/app.yaml` unchanged, so that `pnpm build` succeeds and the deployed container still starts; their removal happens in NOTIFICATIONS-002. |

## Technical constraints

- Replaced features are marked with status `DEPRECATED` in `FEATURES.md`; they are never deleted from the registry.
- No change to application source code under `apps/` or `packages/` — including the SES adapter and its dependency, which stay until NOTIFICATIONS-002.
- No action is taken on the AWS account itself (no `terraform destroy`, no console cleanup, no credential rotation): the change is confined to the repository.
- No replacement deploy automation is introduced; after this feature the only deploy paths are the manual `.do/deploy.sh` and `.cloudflare/deploy.sh` procedures until INFRA-012.

## Dependencies

- INFRA-008 (`DONE`) — the backend must already run outside AWS.
- INFRA-009 (`DONE`) — both SPAs must already be served outside AWS.
- Forward-linked, not blocking: NOTIFICATIONS-002 (email off SES), INFRA-011 (observability and alerting) and INFRA-012 (new pipeline) must exist as entries in the registry so the deprecation notes can point at them.

## Effort estimate

**high** — 10 functional requirements spanning four distinct artifact families (the Terraform tree, six workflow definitions, four living documents and six feature registry entries), two non-functional requirements verified by repository-wide reference checks, four edge cases covering state-less deletion, `DONE`-to-`DEPRECATED` status confusion, requirement preservation across deprecated entries and the deliberately retained SES dependency, plus two completed dependencies and three forward references that the deprecation notes must resolve correctly.
