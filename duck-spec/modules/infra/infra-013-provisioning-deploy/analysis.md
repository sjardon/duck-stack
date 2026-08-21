# INFRA-013 — Runbook de aprovisionamiento y despliegue — Analysis

## Reason for being

With the migration off AWS complete, duck-stack depends on a set of external providers rather than on infrastructure it provisions itself: DigitalOcean App Platform for the backend, Cloudflare Pages for `web` and `landing`, Supabase for PostgreSQL, Clerk for authentication, Mobbex for payments, Resend for transactional email, Better Stack for uptime monitoring and log aggregation, an error-tracking provider for exception reporting and source maps, PostHog for product analytics, and GitHub for the repository plus the Actions pipeline that delivers all three apps. Each of these requires creating an account, creating a project, and collecting a set of credentials, and several of them require manual steps that no script in the repository covers.

That knowledge exists today only in the head of whoever performed the migration, scattered across a dozen feature specs and three component READMEs (`.do/README.md`, `.cloudflare/README.md`, `.github/README.md`), none of which describes the stack as a whole or the order in which the pieces must be stood up. Because duck-stack is a reusable base meant to bootstrap new products, this is the most expensive gap in the project: the code clones in a minute while the stack takes days to rebuild.

The goal is to document the provisioning and operation of the complete stack as a living document, so that someone who clones the repository can bring it up from zero without reconstructing the reasoning behind each decision.

## Scope

A living runbook at `duck-spec/docs/RUNBOOK.md` covering four things: the catalogue of external providers with what each is used for, what must be created in each one and which credentials it issues; the complete environment-variable inventory annotated with the consuming component and the place each value is loaded from; the ordered from-scratch provisioning procedure up to a working environment; and the recurring operations — deploying, deploying a specific commit, rolling back, and rotating a compromised credential. It also covers the manual steps no automation performs, placed at the point of the sequence where they belong.

## Out of scope

- Automating the provisioning of the providers themselves (account, project or credential creation remains manual).
- A local development guide or workstation setup instructions.
- Documenting the application architecture, already covered by the existing living documents (`ARCHITECTURE.md`, `BACKEND.md`, `FRONTEND.md`, `INFRASTRUCTURE.md`).
- Incident diagnosis, troubleshooting trees and on-call procedures.
- Reproducing each provider's own product documentation (console navigation, screenshots, pricing pages).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a runbook document that enumerates every external provider the project depends on and states what each provider is used for. |
| R002 | Ubiquitous | The system shall document, for each enumerated provider, which resources must be created in it (account, project, application, database, and any provider-specific object the stack requires). |
| R003 | Ubiquitous | The system shall document, for each enumerated provider, which credentials it issues and the name under which each credential is consumed by the project. |
| R004 | Ubiquitous | The system shall provide a complete inventory of the environment variables the project uses across the backend, both SPAs and the deploy tooling. |
| R005 | Ubiquitous | The system shall state, for each environment variable in the inventory, which component consumes it. |
| R006 | Ubiquitous | The system shall state, for each environment variable in the inventory, where its value is loaded from. |
| R007 | Ubiquitous | The system shall describe the from-scratch provisioning procedure as an ordered sequence of steps that ends with a functioning environment. |
| R008 | Ubiquitous | The system shall describe how to deploy the stack to an environment. |
| R009 | Ubiquitous | The system shall describe how to deploy a specific commit to a chosen environment. |
| R010 | Ubiquitous | The system shall describe how to roll back an environment to a previously delivered commit. |
| R011 | Event-driven | WHEN a credential is compromised, the system shall describe the rotation procedure for it: revoking and reissuing it at the provider, updating the value in every place it is stored, and redeploying the components that consume it. |
| R012 | Ubiquitous | The system shall enumerate the manual steps that no automation covers and state at which point of the provisioning sequence each one must be performed. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | A reader who has never worked on the project shall be able to provision a new environment end to end by following the runbook alone, without consulting whoever performed the migration. |
| NF002 | The environment-variable inventory shall be verifiable against the codebase and the deploy specifications, so that a variable added, renamed or removed without updating the runbook can be detected. |
| NF003 | The runbook shall contain no credentials and no real environment-specific values — only each variable's name, its consuming component and the origin of its value. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN a provisioning step consumes a value that another provider only issues after being configured (for example the backend public URL that `CORS_ORIGIN`, `VITE_API_URL` and `BETTERSTACK_MONITOR_URL` depend on), the system shall place the producing step before the consuming step in the ordered sequence and state that dependency explicitly at the consuming step. |
| EC002 | WHEN a provisioning step involves an external wait (DNS-based domain verification, alert-subscription confirmation email, or any provider-side approval), the system shall mark the step as blocking and state the expected wait before the step's instructions, so the reader knows about it in advance. |
| EC003 | WHEN a provider's free plan imposes a limit that only becomes visible in production (for example the Better Stack log ingestion quota), the system shall record that limit and its no-code-change mitigation alongside that provider's entry. |
| EC004 | WHEN a change adds, renames or removes an environment variable, a provider, or a deploy step, the system shall require the runbook to be updated in that same change, and shall state this maintenance rule explicitly inside the runbook. *(Assumption: the FEATURES.md edge case only states that the document goes stale on the first infrastructure change; the conservative observable behaviour chosen here is a stated, checkable maintenance rule inside the document itself.)* |
| EC005 | WHEN a second environment is provisioned on accounts that were already set up for a first one, the system shall identify each provisioning step as either per-account (executed once) or per-environment (repeated for every environment), so that only the per-environment steps are executed. |

## Technical constraints

- The runbook is written as a living document at `duck-spec/docs/RUNBOOK.md`, alongside the rest of the project documentation.
- The runbook does not replace the existing component READMEs (`.do/README.md`, `.do/monitoring/README.md`, `.cloudflare/README.md`, `.github/README.md`); it references them for procedural detail instead of duplicating it.
