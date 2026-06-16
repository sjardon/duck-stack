variable "project" {
  description = "Project name, used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production)."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
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
  description = "List of availability zones to deploy subnets into. Must contain at least two entries."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two availability zones must be specified."
  }
}
