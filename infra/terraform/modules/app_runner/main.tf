##############################################################################
# IAM — Access role (image pull from ECR during build/deploy)
##############################################################################

data "aws_iam_policy_document" "app_runner_access_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app_runner_access_role" {
  name               = "${var.project}-${var.environment}-apprunner-access-role"
  assume_role_policy = data.aws_iam_policy_document.app_runner_access_assume.json
}

resource "aws_iam_role_policy_attachment" "app_runner_access_role_ecr" {
  role       = aws_iam_role.app_runner_access_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

##############################################################################
# IAM — Instance role (runtime permissions for the running container)
##############################################################################

data "aws_iam_policy_document" "app_runner_instance_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app_runner_instance_role" {
  name               = "${var.project}-${var.environment}-apprunner-instance-role"
  assume_role_policy = data.aws_iam_policy_document.app_runner_instance_assume.json
}

resource "aws_iam_role_policy_attachment" "app_runner_instance_role_ecr" {
  role       = aws_iam_role.app_runner_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

##############################################################################
# Networking — VPC connector
##############################################################################

resource "aws_security_group" "vpc_connector" {
  name        = "${var.project}-${var.environment}-apprunner-vpc-connector"
  description = "Security group for the App Runner VPC connector"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_apprunner_vpc_connector" "main" {
  vpc_connector_name = "${var.project}-${var.environment}-vpc-connector"
  subnets            = var.private_subnet_ids
  security_groups    = [aws_security_group.vpc_connector.id]
}

##############################################################################
# App Runner service
##############################################################################

resource "aws_apprunner_service" "main" {
  service_name = var.service_name

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.app_runner_access_role.arn
    }

    image_repository {
      image_identifier      = "${var.ecr_repository_url}:${var.image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = tostring(var.port)

        runtime_environment_variables = var.environment_variables
      }
    }

    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = var.cpu
    memory            = var.memory
    instance_role_arn = aws_iam_role.app_runner_instance_role.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  health_check_configuration {
    protocol = "TCP"
    port     = tostring(var.port)
  }
}
