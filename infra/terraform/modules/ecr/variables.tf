variable "project" {
  description = "Project name, used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production)."
  type        = string
}

variable "repository_name" {
  description = "Name of the ECR repository."
  type        = string
}

variable "image_tag_mutability" {
  description = "The tag mutability setting for the ECR repository. Must be MUTABLE or IMMUTABLE."
  type        = string
  default     = "MUTABLE"
}

variable "lifecycle_policy_count" {
  description = "Maximum number of tagged images to retain in the repository."
  type        = number
  default     = 10
}
