variable "project" {
  description = "Project name used to name the S3 bucket and DynamoDB table."
  type        = string
}

variable "aws_region" {
  description = "AWS region where the bootstrap resources are created."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID, used to make the S3 bucket name globally unique."
  type        = string
}
