#!/usr/bin/env bash
# T009 — Acceptance test for R004.
#
# WHEN duck-spec/docs/INFRASTRUCTURE.md is grepped for
#      Terraform|VPC|ECR|App Runner|CloudFront|DynamoDB|OIDC
# THEN there are zero matches
# AND the headings "DigitalOcean App Platform", "Cloudflare Pages",
#     "Not managed here" are still present.
#
# Expected to FAIL until T010 (rewrite INFRASTRUCTURE.md) lands.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DOC="duck-spec/docs/INFRASTRUCTURE.md"
fail=0

if [ ! -f "$DOC" ]; then
  echo "FAIL: $DOC does not exist"
  exit 1
fi

matches="$(grep -nE 'Terraform|\bVPC\b|\bECR\b|App Runner|CloudFront|DynamoDB|OIDC' "$DOC" || true)"
if [ -n "$matches" ]; then
  echo "FAIL: $DOC still references AWS/Terraform infrastructure:"
  echo "$matches"
  fail=1
else
  echo "PASS: $DOC contains no AWS/Terraform reference"
fi

for heading in "DigitalOcean App Platform" "Cloudflare Pages" "Not managed here"; do
  if grep -qF "## $heading" "$DOC"; then
    echo "PASS: heading '## $heading' is present"
  else
    echo "FAIL: heading '## $heading' is missing"
    fail=1
  fi
done

exit "$fail"
