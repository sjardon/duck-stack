terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  backend "s3" {
    bucket         = "duck-stack-terraform-state"
    key            = "terraform/state"
    region         = "us-east-1"
    dynamodb_table = "duck-stack-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      project     = var.project
      environment = var.environment
    }
  }
}

module "vpc" {
  source = "./modules/vpc"

  project              = var.project
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  availability_zones   = var.availability_zones
}

module "ecr" {
  source = "./modules/ecr"

  project         = var.project
  environment     = var.environment
  repository_name = var.ecr_repository_name
}

module "app_runner" {
  source = "./modules/app_runner"

  project                = var.project
  environment            = var.environment
  service_name           = var.app_runner_service_name
  ecr_repository_url     = module.ecr.repository_url
  image_tag              = var.app_runner_image_tag
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  port                   = var.app_runner_port
  environment_variables  = var.app_runner_environment_variables
}
