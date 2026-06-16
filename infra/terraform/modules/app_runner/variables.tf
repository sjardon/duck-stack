variable "project" {
  description = "Project name, used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production)."
  type        = string
}

variable "service_name" {
  description = "Name of the App Runner service."
  type        = string
}

variable "ecr_repository_url" {
  description = "Full URL of the ECR repository where the service image is stored."
  type        = string
}

variable "image_tag" {
  description = "Tag of the container image to deploy."
  type        = string
  default     = "latest"
}

variable "vpc_id" {
  description = "ID of the VPC to attach the App Runner service to via a VPC connector."
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs used by the VPC connector."
  type        = list(string)
}

variable "cpu" {
  description = "CPU units allocated to each App Runner service instance (e.g. '1 vCPU')."
  type        = string
  default     = "1 vCPU"
}

variable "memory" {
  description = "Memory allocated to each App Runner service instance (e.g. '2 GB')."
  type        = string
  default     = "2 GB"
}

variable "port" {
  description = "Port the container listens on."
  type        = number
  default     = 3000
}

variable "environment_variables" {
  description = "Map of environment variables to pass to the running container."
  type        = map(string)
  default     = {}
}
