# INFRA-008 — Backend deployment on DigitalOcean App Platform — Analysis

## Reason for being

The backend infrastructure was designed on AWS App Runner (INFRA-002) but was never deployed: AWS closed App Runner to new customers and the project account has no service created. The Terraform that defines VPC, ECR and App Runner was never applied. As a consequence the compute layer was moved out of AWS to DigitalOcean App Platform, and Terraform was dropped from the project: with the database on Supabase, authentication on Clerk, and the remaining capabilities contracted as third-party services, there is no cloud resource left to provision beyond the container itself.

The backend is already containerized, but its Dockerfile cannot be built the way the current pipeline invokes it: `apps/services/Dockerfile` copies `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` and the shared packages' `package.json` files, all of which only exist at the monorepo root, while the existing build uses the app directory as build context.

The goal is to leave the `services` backend running on DigitalOcean App Platform from an application specification versioned in the repository, deployable manually and repeatably.

## Scope

A declarative DigitalOcean App Platform application specification, versioned at `.do/app.yaml`, that defines a single service component for `apps/services`: image built from the existing Dockerfile with the monorepo root as build context, runtime environment variables (plain and secret) configurable per environment, an HTTP health check against the already-exposed `/health` endpoint, and a public HTTPS ingress. It also covers the documented, repeatable manual deploy procedure that applies that specification through the provider CLI, and making the resulting public backend URL available to configure the rest of the system.

## Out of scope

- Automatic deploy on merge, manual deploy of an arbitrary commit, and rollback (INFRA-012).
- Hosting for `web` and `landing` (INFRA-009).
- Removal of the Terraform project and the AWS workflows (INFRA-010).
- Custom domains and certificates.
- Scheduled job or background worker components.
- Any change to the code under `apps/services`.

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall define the complete configuration of the `services` application in a declarative specification file versioned in the repository at `.do/app.yaml`. |
| R002 | Ubiquitous | The specification shall declare exactly one component of type `service` for `apps/services`, with public HTTP ingress on the route the backend serves. |
| R003 | Event-driven | WHEN the versioned specification is applied to DigitalOcean App Platform, the system shall expose the backend on a publicly reachable HTTPS URL without any additional manual configuration in the provider console. |
| R004 | Ubiquitous | The specification shall build the service image from `apps/services/Dockerfile` using the monorepo root as Docker build context. |
| R005 | Event-driven | WHEN the platform builds the service component, the system shall make the monorepo root files referenced by the Dockerfile (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and the `packages/*/package.json` files) resolvable from the build context, so the build completes and produces the runnable `dist/server.js` artifact. |
| R006 | Ubiquitous | The specification shall declare every runtime environment variable the backend reads (`NODE_ENV`, `LOG_LEVEL`, `HOST`, `PORT`, `CORS_ORIGIN`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `EMAIL_SENDER_ADDRESS`, `SES_REGION`, `BILLING_PROVIDER`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_TEST_MODE`, `MOBBEX_TIMEOUT_MS`, `MOBBEX_WEBHOOK_SECRET`, `SIGNUP_MODE`, `FREE_TRIAL_DAYS`, `STRICT_ENTITLEMENTS_ON_PAST_DUE`) so the running container receives them at startup. |
| R007 | Ubiquitous | The specification shall allow each declared environment variable to take a different value per environment without duplicating or forking the specification structure. |
| R008 | Conditional | IF a declared environment variable holds a sensitive value (credentials, API keys, signing secrets, database connection string), THEN the system shall declare it as a secret-typed variable whose plaintext value is supplied at deploy time and never committed to the repository. |
| R009 | Ubiquitous | The specification shall configure a platform HTTP health check that periodically probes the backend's existing `GET /health` endpoint on the service's HTTP port. |
| R010 | Event-driven | WHEN an operator follows the documented deploy procedure, the system shall apply the versioned specification through the DigitalOcean CLI and reconcile the running application to match it, producing the same result on every execution for the same specification and secret values. |
| R011 | Event-driven | WHEN a deploy completes successfully, the system shall make the resulting public backend URL available in the repository documentation so the remaining components of the system can be configured against it. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The versioned application specification shall be the single source of truth for the service configuration: re-applying it shall restore every configuration value it declares, discarding divergences introduced through the provider console. |
| NF002 | The manual deploy procedure shall be executable end to end by any team member using only the repository documentation, with no undocumented step and no prior knowledge of the provider account beyond authenticated CLI access. |
| NF003 | No secret value shall be committed to the repository: the specification and any accompanying files shall reference secrets by name only, and a scan of the tracked files shall find no credential, API key, signing secret or database connection string. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the service component is built with `apps/services` as Docker build context (the way the current AWS pipeline invokes it), the build fails on `COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./` because those files only exist at the monorepo root; the system shall declare the repository root as build context and `apps/services/Dockerfile` as dockerfile path, so the platform build completes and the resulting image starts with `node dist/server.js`. |
| EC002 | WHEN the container starts without `EMAIL_SENDER_ADDRESS` set, `resolveNotifier` throws `Missing required env var: EMAIL_SENDER_ADDRESS` while the webhooks plugin is registered and the process exits before binding the HTTP port, which the platform reports as a generic deploy failure; the system shall declare `EMAIL_SENDER_ADDRESS` as a required variable in every environment and the deploy documentation shall list this exact error message as a missing-configuration failure rather than a platform failure. |
| EC003 | WHEN a deployed instance fails the configured health check repeatedly, the platform shall keep the previous healthy deployment serving public traffic and mark the new deployment as failed; because the service does not scale to zero, the deploy documentation shall state that the application keeps consuming budget until it is explicitly scaled down or destroyed through the CLI, and shall document the command to do so. |
| EC004 | WHEN a declared environment variable still points to a decommissioned AWS service (for example `SES_REGION`, consumed by the SES email adapter), the system shall declare it with an explicit placeholder value annotated with the feature that will replace it, so the container starts successfully and the failure surfaces only at the moment that integration is actually invoked. Assumption: a placeholder is preferred over omitting the variable, since omission would risk a startup abort like EC002. |
| EC005 | WHEN a configuration change is made by hand in the provider console, the next execution of the documented deploy procedure shall overwrite it with the values declared in `.do/app.yaml`; the deploy documentation shall state explicitly that console edits are not durable and must be made in the specification instead. |
| EC006 | WHEN the platform's HTTP port and the port the container binds (`PORT`, defaulting to `3000` in `serverConfig`) do not match, the health check never succeeds and the deployment is marked failed; the system shall declare the HTTP port in the specification and the `PORT` variable consistently, so the health check reaches `GET /health` on the port the process is listening on. |

## Technical constraints

- Compute platform: DigitalOcean App Platform, component of type `service`.
- Declarative specification at `.do/app.yaml`, applied with the provider CLI (`doctl`).
- Image built from `apps/services/Dockerfile`, with the monorepo root as build context.
- No Terraform: the application specification replaces the infrastructure module as the source of truth for the compute layer.
- The container binds `HOST` `0.0.0.0` and `PORT` (default `3000`) and exposes `GET /health`; the specification must align the platform HTTP port with that value.
- No changes to `apps/services` source code, `Dockerfile` included: the specification must adapt to the existing Dockerfile, not the other way around.

## Dependencies

- A DigitalOcean account/team with App Platform enabled and an authenticated `doctl` CLI on the operator's machine.
- Externally provisioned runtime credentials already in use by the backend (Supabase `DATABASE_URL`, Clerk keys, Mobbex credentials) must exist before the first deploy, since the service will not run without them.
- Downstream: INFRA-009 (frontend hosting) and INFRA-012 (automated deploy and rollback) consume the public backend URL and the specification produced here.

## Effort estimate

**high** — 11 functional requirements covering the specification, the build-context fix, per-environment variables, secret handling, health checks and the manual deploy procedure; three non-functional requirements including a hard security guarantee (no secrets in the repository); six edge cases spanning build failure, startup abort on missing configuration, health-check/port mismatch, cost of a non-scaling service, orphaned AWS-era variables, and console drift; plus external dependencies on the provider account and on already-provisioned third-party credentials.
