# INFRA-003 — Static Hosting (S3 + CloudFront)

## Reason for being

The `web` and `landing` applications are static SPAs generated with Vite. They require public, efficient, and secure delivery infrastructure so end users can access them over the internet. To preserve a strong security posture, the S3 buckets that hold the built assets must remain private, and all public access must be brokered exclusively through CloudFront distributions.

The objective is to provision, with Terraform, two CloudFront distributions backed by private S3 buckets to serve `web` and `landing` as static SPAs, with the routing fallbacks required for client-side React Router.

## Scope

Terraform-managed provisioning of: two private S3 buckets (one per app), two CloudFront distributions (one per app), Origin Access Control (OAC) for each distribution so CloudFront can read from its bucket without making the bucket public, custom CloudFront error responses that map 403/404 to `index.html` with HTTP 200 to enable client-side routing, and Terraform outputs exposing the CloudFront URLs for both distributions.

## Out of scope

- Custom domain names and SSL certificates (deferred to a later feature).
- CI/CD pipeline for uploading the static assets (INFRA-004).
- WAF rules, geo-restrictions, or other request-filtering policies.
- Multiple environments (dev/staging/prod) — this feature provisions a single environment.
- Build configuration of the `web` and `landing` apps themselves.

## Functional requirements

| ID   | Requirement |
|------|-------------|
| R001 | The system shall provision a private S3 bucket to store the built static assets of the `web` application. |
| R002 | The system shall provision a private S3 bucket to store the built static assets of the `landing` application. |
| R003 | The system shall provision a CloudFront distribution for `web` whose origin is the `web` S3 bucket. |
| R004 | The system shall provision a CloudFront distribution for `landing` whose origin is the `landing` S3 bucket. |
| R005 | The system shall configure an Origin Access Control (OAC) on each CloudFront distribution so that only that distribution can read objects from its origin bucket. |
| R006 | The system shall attach an S3 bucket policy on each bucket that grants read access exclusively to its associated CloudFront distribution via OAC. |
| R007 | WHEN CloudFront receives a 403 or 404 response from the S3 origin, the system shall return `index.html` with HTTP status 200 so client-side React Router can resolve the route. |
| R008 | The system shall expose Terraform outputs containing the CloudFront distribution URL for both the `web` and `landing` distributions. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NF001 | The S3 buckets backing the CloudFront distributions shall not be publicly accessible under any circumstance. |
| NF002 | CloudFront shall serve all content over HTTPS by default, redirecting or rejecting plain HTTP requests. |

## Edge cases

| ID    | Edge case |
|-------|-----------|
| EC001 | If a user requests a deep link such as `/dashboard/settings` that does not correspond to a real S3 object, CloudFront shall serve `index.html` with status 200 so React Router can handle the route on the client. |
| EC002 | If someone attempts to access an S3 bucket URL directly (bypassing CloudFront), the request shall be denied because the bucket is private and only the OAC principal is authorized. |
| EC003 | If a CloudFront distribution is recreated or its identity changes, the S3 bucket policy must be re-evaluated so the new distribution retains read access and previous identities lose it. |
| EC004 | If an object exists in S3 but the OAC is misconfigured, the system shall surface an access-denied error via CloudFront rather than silently serving stale or empty content. |
| EC005 | If a client requests the bucket over plain HTTP, CloudFront shall enforce the HTTPS policy and not serve content over an insecure channel. |

## Technical constraints

- IaC: Terraform
- CDN: AWS CloudFront
- Storage: AWS S3 (private buckets only)
- Private origin access: Origin Access Control (OAC)
- SPA routing fallback: CloudFront custom error responses mapping 403/404 to `/index.html` with HTTP 200

## Dependencies

- INFRA-001 — the `web` and `landing` applications must exist in the monorepo so their built assets can be uploaded to the provisioned buckets.

## Effort estimate

**medium** — 8 functional requirements, NFRs covering security (private buckets) and transport security (HTTPS), 5 edge cases, one upstream dependency. The infrastructure surface is focused (S3 + CloudFront + OAC + bucket policies + custom error responses) without the additional complexity of remote state bootstrap, networking, or container services.
