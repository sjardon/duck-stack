#!/usr/bin/env bash
# Acceptance tests for .github/workflows/deploy-apps.yml (INFRA-012)
#
# Covers:
#   T014 (R008, NF002, EC006) — on.workflow_call.inputs declares `environment`
#     and `commit_sha` as required strings; the `deploy` job's `environment`
#     key equals the literal expression "${{ inputs.environment }}";
#     permissions.contents == "write"; no step content matches
#     environment == 'prod' / environment == 'dev' (no per-environment
#     branching).
#   T015 (R001, R002, R003, R004, R006, NF002, EC001, EC006) — exactly three
#     steps with continue-on-error: true exist, one invoking .do/deploy.sh
#     (preceded by a call to .github/scripts/pin-do-deploy-ref.sh), one
#     invoking .cloudflare/deploy.sh web, one invoking
#     .cloudflare/deploy.sh landing; a final step has if: always() and
#     invokes .github/scripts/report-deploy-summary.sh; the three deploy
#     steps appear in the job's step list before the report step
#     (sequential, not parallel jobs).
#
# This is the "test" phase of INFRA-012: .github/workflows/deploy-apps.yml
# does not exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash .github/tests/deploy-apps-workflow.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW_FILE="$REPO_ROOT/.github/workflows/deploy-apps.yml"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

if [ ! -f "$WORKFLOW_FILE" ]; then
  fail "T014: $WORKFLOW_FILE does not exist"
  fail "T015: $WORKFLOW_FILE does not exist"
  exit "$FAILED"
fi

STRUCT_OUTPUT="$(python3 - "$WORKFLOW_FILE" <<'PYEOF'
import sys

path = sys.argv[1]

try:
    import yaml
except ImportError:
    print("FAIL: T014: PyYAML is not installed; cannot parse deploy-apps.yml")
    sys.exit(0)


def check(task, cond, detail):
    print(f"{'PASS' if cond else 'FAIL'}: {task}: {detail}")


try:
    with open(path) as f:
        raw = f.read()
except FileNotFoundError:
    sys.exit(0)

try:
    doc = yaml.safe_load(raw)
except Exception as exc:
    check("T014", False, f"expected {path} to parse as valid YAML, got error: {exc}")
    sys.exit(0)

check("T014", isinstance(doc, dict), "expected the document root to be a mapping")

# YAML parses the bare key `on:` as the boolean True.
on_block = (doc.get("on") if isinstance(doc, dict) else None) or (doc.get(True) if isinstance(doc, dict) else None)

workflow_call = on_block.get("workflow_call") if isinstance(on_block, dict) else None
inputs = workflow_call.get("inputs") if isinstance(workflow_call, dict) else None

env_input = inputs.get("environment") if isinstance(inputs, dict) else None
check("T014", isinstance(env_input, dict) and env_input.get("required") is True and env_input.get("type") == "string",
      f"expected on.workflow_call.inputs.environment to be required: true, type: string, got {env_input!r}")

sha_input = inputs.get("commit_sha") if isinstance(inputs, dict) else None
check("T014", isinstance(sha_input, dict) and sha_input.get("required") is True and sha_input.get("type") == "string",
      f"expected on.workflow_call.inputs.commit_sha to be required: true, type: string, got {sha_input!r}")

jobs = doc.get("jobs") if isinstance(doc, dict) else None
deploy_job = jobs.get("deploy") if isinstance(jobs, dict) else None

check("T014", isinstance(deploy_job, dict) and deploy_job.get("environment") == "${{ inputs.environment }}",
      f"expected jobs.deploy.environment == '${{{{ inputs.environment }}}}', got "
      f"{deploy_job.get('environment') if isinstance(deploy_job, dict) else '<missing deploy job>'!r}")

permissions = doc.get("permissions") if isinstance(doc, dict) else None
check("T014", isinstance(permissions, dict) and permissions.get("contents") == "write",
      f"expected permissions.contents == 'write', got {permissions!r}")

steps = deploy_job.get("steps") if isinstance(deploy_job, dict) else None
steps = steps if isinstance(steps, list) else []

# No per-environment branching anywhere in the workflow body.
has_branching = False
for step in steps:
    if not isinstance(step, dict):
        continue
    for value in step.values():
        text = str(value)
        if "environment == 'prod'" in text or "environment == 'dev'" in text \
           or 'environment == "prod"' in text or 'environment == "dev"' in text:
            has_branching = True
check("T014", not has_branching,
      "expected no step content to branch on environment == 'prod' / environment == 'dev'")

# T015 — exactly three continue-on-error steps, and their content.
co_error_steps = [s for s in steps if isinstance(s, dict) and s.get("continue-on-error") is True]
check("T015", len(co_error_steps) == 3,
      f"expected exactly 3 steps with continue-on-error: true, got {len(co_error_steps)}")


def step_text(step):
    return "\n".join(str(v) for v in step.values() if isinstance(step, dict))


services_step = next((s for s in co_error_steps if ".do/deploy.sh" in step_text(s)), None)
check("T015", services_step is not None,
      "expected one continue-on-error step to invoke .do/deploy.sh")
check("T015", services_step is not None and "pin-do-deploy-ref.sh" in step_text(services_step),
      "expected the .do/deploy.sh step to also call .github/scripts/pin-do-deploy-ref.sh")

web_step = next((s for s in co_error_steps if ".cloudflare/deploy.sh web" in step_text(s)), None)
check("T015", web_step is not None,
      "expected one continue-on-error step to invoke .cloudflare/deploy.sh web")

landing_step = next((s for s in co_error_steps if ".cloudflare/deploy.sh landing" in step_text(s)), None)
check("T015", landing_step is not None,
      "expected one continue-on-error step to invoke .cloudflare/deploy.sh landing")

report_step = next((s for s in steps if isinstance(s, dict) and s.get("if") == "always()"
                     and "report-deploy-summary.sh" in step_text(s)), None)
check("T015", report_step is not None,
      "expected a final step with if: always() invoking .github/scripts/report-deploy-summary.sh")

if report_step is not None and len(co_error_steps) == 3:
    report_index = steps.index(report_step)
    deploy_indices = [steps.index(s) for s in co_error_steps]
    check("T015", all(i < report_index for i in deploy_indices),
          f"expected the three continue-on-error steps (indices {deploy_indices}) to appear before the report step (index {report_index})")
PYEOF
)"

if [ -n "$STRUCT_OUTPUT" ]; then
  echo "$STRUCT_OUTPUT"
  if echo "$STRUCT_OUTPUT" | grep -q '^FAIL:'; then
    FAILED=1
  fi
fi

exit "$FAILED"
