# INFRA-003 — Static Hosting (S3 + CloudFront): Tasks

## T001 — Create `modules/static_site/variables.tf`

In the new file `infra/terraform/modules/static_site/variables.tf`, declare the three input variables consumed by the module: `project` (string, project name used for resource naming), `environment` (string, deployment environment used for resource naming), and `app_name` (string, short application identifier such as `web` or `landing`). All three variables are required with no defaults.

Covers: R001, R002, R003, R004, R005, R006, R007, R008

---

## T002 — Create `modules/static_site/main.tf` — private S3 bucket

In the new file `infra/terraform/modules/static_site/main.tf`, declare `aws_s3_bucket.main` with `bucket = "${var.project}-${var.environment}-${var.app_name}"` and no ACL (bucket ownership defaults to `BucketOwnerEnforced`). Immediately follow it with `aws_s3_bucket_public_access_block.main` that sets `block_public_acls`, `block_public_policy`, `ignore_public_acls`, and `restrict_public_buckets` all to `true`.

Covers: R001, R002, NF001

---

## T003 — Create `modules/static_site/main.tf` — CloudFront Origin Access Control

In `infra/terraform/modules/static_site/main.tf`, append `aws_cloudfront_origin_access_control.main` with `name = "${var.project}-${var.environment}-${var.app_name}-oac"`, `origin_access_control_origin_type = "s3"`, `signing_behavior = "always"`, and `signing_protocol = "sigv4"`.

Covers: R005

---

## T004 — Create `modules/static_site/main.tf` — CloudFront distribution

In `infra/terraform/modules/static_site/main.tf`, append `aws_cloudfront_distribution.main` configured as follows:
- `enabled = true`
- `default_root_object = "index.html"`
- `price_class = "PriceClass_100"`
- One `origin` block: `domain_name = aws_s3_bucket.main.bucket_regional_domain_name`, `origin_id = "s3-${var.app_name}"`, `origin_access_control_id = aws_cloudfront_origin_access_control.main.id`
- `default_cache_behavior` with `target_origin_id = "s3-${var.app_name}"`, `viewer_protocol_policy = "redirect-to-https"`, `allowed_methods = ["GET", "HEAD"]`, `cached_methods = ["GET", "HEAD"]`, and a `forwarded_values` block with `query_string = false` and `cookies { forward = "none" }`
- Two `custom_error_response` blocks: one for `error_code = 403` with `response_code = 200` and `response_page_path = "/index.html"`, and one for `error_code = 404` with `response_code = 200` and `response_page_path = "/index.html"`
- `restrictions { geo_restriction { restriction_type = "none" } }`
- `viewer_certificate { cloudfront_default_certificate = true }`

Covers: R003, R004, R007, NF002

---

## T005 — Create `modules/static_site/main.tf` — S3 bucket policy

In `infra/terraform/modules/static_site/main.tf`, append a `data "aws_iam_policy_document" "cloudfront_oac"` block that contains one `statement` granting `s3:GetObject` on `"${aws_s3_bucket.main.arn}/*"` to the `cloudfront.amazonaws.com` service principal, conditioned on `StringEquals` `aws:SourceArn` equaling `aws_cloudfront_distribution.main.arn`. Then declare `aws_s3_bucket_policy.main` that applies this document to `aws_s3_bucket.main.id`, with an explicit `depends_on` on `aws_s3_bucket_public_access_block.main` to ensure the public-access block is in place before the policy is written.

Covers: R006, NF001, EC002, EC003, EC004

---

## T006 — Create `modules/static_site/outputs.tf`

In the new file `infra/terraform/modules/static_site/outputs.tf`, declare four outputs: `distribution_domain_name` (value: `aws_cloudfront_distribution.main.domain_name`), `distribution_arn` (value: `aws_cloudfront_distribution.main.arn`), `bucket_id` (value: `aws_s3_bucket.main.id`), and `bucket_arn` (value: `aws_s3_bucket.main.arn`). Each output must include a `description` string.

Covers: R008

---

## T007 — Instantiate `static_site` module twice in `infra/terraform/main.tf`

In `infra/terraform/main.tf`, append two module blocks after the existing `module "app_runner"` block. The first block is `module "static_site_web"` with `source = "./modules/static_site"`, `project = var.project`, `environment = var.environment`, and `app_name = "web"`. The second block is `module "static_site_landing"` with the same inputs except `app_name = "landing"`.

Covers: R001, R002, R003, R004

---

## T008 — Add CloudFront URL outputs to `infra/terraform/outputs.tf`

In `infra/terraform/outputs.tf`, append two output blocks. The first is `web_cloudfront_url` with `description = "CloudFront distribution URL for the web application."` and `value = module.static_site_web.distribution_domain_name`. The second is `landing_cloudfront_url` with `description = "CloudFront distribution URL for the landing application."` and `value = module.static_site_landing.distribution_domain_name`.

Covers: R008
