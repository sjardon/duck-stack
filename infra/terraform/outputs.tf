output "ecr_repository_url" {
  description = "Full URL of the ECR repository for the services container image."
  value       = module.ecr.repository_url
}

output "app_runner_service_url" {
  description = "URL of the App Runner service."
  value       = module.app_runner.service_url
}

output "vpc_id" {
  description = "ID of the provisioned VPC."
  value       = module.vpc.vpc_id
}

output "web_cloudfront_url" {
  description = "CloudFront distribution URL for the web application."
  value       = module.static_site_web.distribution_domain_name
}

output "landing_cloudfront_url" {
  description = "CloudFront distribution URL for the landing application."
  value       = module.static_site_landing.distribution_domain_name
}
