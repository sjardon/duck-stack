output "state_bucket_name" {
  description = "Name of the S3 bucket that stores Terraform state. Use this value in the root module backend block."
  value       = aws_s3_bucket.terraform_state.id
}

output "locks_table_name" {
  description = "Name of the DynamoDB table used for Terraform state locking. Use this value in the root module backend block."
  value       = aws_dynamodb_table.terraform_locks.name
}
