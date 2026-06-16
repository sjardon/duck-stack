output "service_url" {
  description = "URL of the App Runner service."
  value       = aws_apprunner_service.main.service_url
}

output "service_arn" {
  description = "ARN of the App Runner service."
  value       = aws_apprunner_service.main.arn
}

output "vpc_connector_arn" {
  description = "ARN of the VPC connector attached to the App Runner service. Expose for diagnostic visibility (EC003)."
  value       = aws_apprunner_vpc_connector.main.arn
}
