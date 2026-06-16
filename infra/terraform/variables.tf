variable "project" {
  description = "Project name applied to all resources as a tag and used in resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production) applied to all resources as a tag."
  type        = string
}

variable "aws_region" {
  description = "AWS region where all resources are provisioned."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets, one per availability zone."
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets, one per availability zone."
  type        = list(string)
}

variable "availability_zones" {
  description = "List of availability zones used when provisioning subnets. Must have at least two entries."
  type        = list(string)
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository for the services container image."
  type        = string
  default     = "services"
}

variable "app_runner_service_name" {
  description = "Name of the App Runner service."
  type        = string
}

variable "app_runner_image_tag" {
  description = "Container image tag used by the App Runner service."
  type        = string
  default     = "latest"
}

variable "app_runner_port" {
  description = "Port the services container listens on."
  type        = number
  default     = 3000
}

variable "app_runner_environment_variables" {
  description = "Map of environment variables passed to the App Runner service at runtime."
  type        = map(string)
  default     = {}
}
