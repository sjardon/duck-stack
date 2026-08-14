#!/usr/bin/env bash
# T001 — Acceptance test for R001, EC001.
#
# WHEN the repository is inspected
# THEN `infra/terraform` does not exist
# AND `infra` itself contains no tracked file (git ls-files infra/ is empty)
#
# Expected to FAIL until T002 (delete the Terraform tree) lands.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

fail=0

if [ -e infra/terraform ]; then
  echo "FAIL: infra/terraform still exists"
  fail=1
else
  echo "PASS: infra/terraform does not exist"
fi

tracked_infra_files="$(git ls-files infra/)"
if [ -n "$tracked_infra_files" ]; then
  echo "FAIL: infra/ still has tracked files:"
  echo "$tracked_infra_files"
  fail=1
else
  echo "PASS: infra/ has no tracked files"
fi

exit "$fail"
