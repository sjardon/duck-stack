resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  for_each = { for idx, az in var.availability_zones : az => idx }

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[each.value]
  availability_zone       = each.key
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private" {
  for_each = { for idx, az in var.availability_zones : az => idx }

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[each.value]
  availability_zone = each.key
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}
