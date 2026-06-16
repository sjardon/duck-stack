# INFRA-003 — Static Hosting (S3 + CloudFront): Design

## Problem statement

The `web` and `landing` Vite SPAs need public, secure, and efficient global delivery. S3 buckets holding the built assets must remain strictly private; all public access must flow exclusively through CloudFront. The objective is to provision, with Terraform, two CloudFront distributions backed by private S3 buckets — one per app — including OAC authorization, SPA routing fallback via custom error responses, and Terraform outputs that expose the distribution URLs.

## Chosen solution

**Reusable Terraform module: `modules/static_site`**

A single, parameterized Terraform module (`static_site`) encapsulates one private S3 bucket, one CloudFront OAC, one CloudFront distribution with HTTPS-only viewer protocol policy and 403/404-to-`index.html` custom error responses, and the S3 bucket policy that grants read access exclusively to that distribution's OAC principal. The root configuration instantiates this module twice — once for `web` and once for `landing` — and wires their outputs into the root `outputs.tf`. This approach satisfies all eight functional requirements (R001–R008) and both non-functional requirements (NF001–NF002) using the same Terraform module conventions already established in the project (separate `main.tf`, `variables.tf`, `outputs.tf` per module; resource naming with `${var.project}-${var.environment}-*`).

## Technical design

### Module interface — `modules/static_site`

**Input variables**

| Variable | Type | Description |
|---|---|---|
| `project` | `string` | Project name used for resource naming and tagging. |
| `environment` | `string` | Deployment environment used for resource naming and tagging. |
| `app_name` | `string` | Short application identifier (`web` or `landing`). Used in all resource names. |

**Resources created per module instance**

1. `aws_s3_bucket.main` — Private bucket named `${var.project}-${var.environment}-${var.app_name}`. Public access block set to block all public access (satisfies R001/R002, NF001).
2. `aws_s3_bucket_public_access_block.main` — Enforces all four public-access-block flags: `block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets` (NF001, EC002).
3. `aws_cloudfront_origin_access_control.main` — OAC for S3 origin with `signing_behavior = "always"` and `signing_protocol = "sigv4"` (R005, EC003, EC004).
4. `aws_cloudfront_distribution.main` — Distribution with:
   - Origin pointing to `aws_s3_bucket.main.bucket_regional_domain_name` using the OAC above.
   - `default_cache_behavior.viewer_protocol_policy = "redirect-to-https"` (NF002, EC005).
   - `default_root_object = "index.html"`.
   - Two `custom_error_response` blocks: HTTP 403 → `/index.html`, response code 200; HTTP 404 → `/index.html`, response code 200 (R007, EC001).
   - `price_class = "PriceClass_100"` (cost-appropriate default; not a constraint, easily overridden).
   - `enabled = true`.
5. `aws_s3_bucket_policy.main` — Bucket policy granting `s3:GetObject` to the CloudFront distribution's service principal (`cloudfront.amazonaws.com`) conditioned on `aws:SourceArn` matching the distribution ARN. Denies all other principals (R006, EC002, EC003, EC004).

**Bucket policy data source**

```
data "aws_iam_policy_document" "cloudfront_oac" {
  statement {
    sid    = "AllowCloudFrontServicePrincipal"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.main.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}
```

**Output values per module instance**

| Output | Value |
|---|---|
| `distribution_domain_name` | `aws_cloudfront_distribution.main.domain_name` |
| `distribution_arn` | `aws_cloudfront_distribution.main.arn` |
| `bucket_id` | `aws_s3_bucket.main.id` |
| `bucket_arn` | `aws_s3_bucket.main.arn` |

### Root configuration changes

**`infra/terraform/main.tf`** — Add two module blocks:

```hcl
module "static_site_web" {
  source      = "./modules/static_site"
  project     = var.project
  environment = var.environment
  app_name    = "web"
}

module "static_site_landing" {
  source      = "./modules/static_site"
  project     = var.project
  environment = var.environment
  app_name    = "landing"
}
```

**`infra/terraform/outputs.tf`** — Add two outputs:

```hcl
output "web_cloudfront_url" {
  description = "CloudFront distribution URL for the web application."
  value       = module.static_site_web.distribution_domain_name
}

output "landing_cloudfront_url" {
  description = "CloudFront distribution URL for the landing application."
  value       = module.static_site_landing.distribution_domain_name
}
```

No new root variables are required — `project` and `environment` already exist in `variables.tf`.

### Data / control flow

```
User request (HTTPS)
  → CloudFront distribution (viewer_protocol_policy: redirect-to-https)
    → OAC signs request with SigV4
      → S3 bucket (private, bucket policy allows only OAC principal)
        → object found  → serve asset
        → 403/404       → CloudFront custom_error_response → /index.html, HTTP 200
                          → React Router resolves client-side route
```

## Files

| Action | Path |
|---|---|
| CREATE | `infra/terraform/modules/static_site/main.tf` |
| CREATE | `infra/terraform/modules/static_site/variables.tf` |
| CREATE | `infra/terraform/modules/static_site/outputs.tf` |
| MODIFY | `infra/terraform/main.tf` |
| MODIFY | `infra/terraform/outputs.tf` |

## Requirement coverage

| ID | Design decision that satisfies it |
|---|---|
| R001 | `aws_s3_bucket.main` in `modules/static_site`, instantiated as `module.static_site_web` with `app_name = "web"`. |
| R002 | `aws_s3_bucket.main` in `modules/static_site`, instantiated as `module.static_site_landing` with `app_name = "landing"`. |
| R003 | `aws_cloudfront_distribution.main` in `modules/static_site`, instantiated as `module.static_site_web`; origin is the web S3 bucket via its regional domain name. |
| R004 | `aws_cloudfront_distribution.main` in `modules/static_site`, instantiated as `module.static_site_landing`; origin is the landing S3 bucket via its regional domain name. |
| R005 | `aws_cloudfront_origin_access_control.main` with `signing_behavior = "always"` attached to each distribution's origin block. |
| R006 | `aws_s3_bucket_policy.main` using `data.aws_iam_policy_document.cloudfront_oac` that grants `s3:GetObject` only to the `cloudfront.amazonaws.com` service principal conditioned on the distribution ARN. |
| R007 | Two `custom_error_response` blocks in `aws_cloudfront_distribution.main`: HTTP 403 → `/index.html` / 200, and HTTP 404 → `/index.html` / 200. |
| R008 | `web_cloudfront_url` and `landing_cloudfront_url` outputs in `infra/terraform/outputs.tf` sourced from `module.static_site_web.distribution_domain_name` and `module.static_site_landing.distribution_domain_name`. |
| NF001 | `aws_s3_bucket_public_access_block.main` blocks all four public-access flags; bucket policy only allows the OAC service principal. |
| NF002 | `viewer_protocol_policy = "redirect-to-https"` in `default_cache_behavior` of every distribution. |
