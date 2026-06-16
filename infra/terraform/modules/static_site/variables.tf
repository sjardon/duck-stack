variable "project" {
  description = "Project name used for resource naming and tagging."
  type        = string
}

variable "environment" {
  description = "Deployment environment used for resource naming and tagging."
  type        = string
}

variable "app_name" {
  description = "Short application identifier (e.g. web or landing). Used in all resource names."
  type        = string
}
