#!/usr/bin/env bash
# Acceptance tests for the four entry-point workflows (INFRA-012):
# .github/workflows/deploy-dev.yml, deploy-prod.yml, deploy-manual.yml and
# rollback.yml.
#
# Covers:
#   T018 (R001, R007, EC004) — deploy-dev.yml's on.push.branches == ["develop"];
#     the calling job's concurrency == { group: "deploy-dev",
#     cancel-in-progress: false }; it calls deploy-apps.yml with
#     with: { environment: "dev", commit_sha: "${{ github.sha }}" }.
#   T020 (R002, R007, EC004) — deploy-prod.yml's on.push.branches == ["main"];
#     concurrency group "deploy-prod", cancel-in-progress: false; calls
#     deploy-apps.yml with environment: "prod", commit_sha: "${{ github.sha }}".
#   T023 (R003, R007, R008) — deploy-manual.yml's on.workflow_dispatch.inputs
#     declares environment (type: choice, options: [dev, prod], required) and
#     commit_sha (type: string, required); concurrency group is the literal
#     expression "deploy-${{ inputs.environment }}" with
#     cancel-in-progress: false; it calls deploy-apps.yml with
#     with: { environment: ${{ inputs.environment }},
#     commit_sha: ${{ inputs.commit_sha }} }.
#   T026 (R004, EC003) — rollback.yml has the same workflow_dispatch
#     inputs/concurrency shape as deploy-manual.yml; a step, ordered before
#     the call to deploy-apps.yml, whose run: content matches
#     (case-insensitively) both "not reverted" and "database state".
#
# This is the "test" phase of INFRA-012: none of these workflow files exist
# yet, so every assertion below is expected to FAIL until the "implement"
# phase creates them.
#
# Run: bash .github/tests/trigger-workflows.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOWS_DIR="$REPO_ROOT/.github/workflows"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

STRUCT_OUTPUT="$(python3 - "$WORKFLOWS_DIR" <<'PYEOF'
import sys
import os

workflows_dir = sys.argv[1]

try:
    import yaml
except ImportError:
    print("FAIL: T018: PyYAML is not installed; cannot parse workflow files")
    sys.exit(0)


def check(task, cond, detail):
    print(f"{'PASS' if cond else 'FAIL'}: {task}: {detail}")


def load(name):
    path = os.path.join(workflows_dir, name)
    if not os.path.isfile(path):
        return None, path
    with open(path) as f:
        raw = f.read()
    try:
        return yaml.safe_load(raw), path
    except Exception as exc:
        return {"__parse_error__": str(exc)}, path


def on_block(doc):
    if not isinstance(doc, dict):
        return None
    return doc.get("on") or doc.get(True)


def deploy_apps_job(doc):
    """Returns (job_dict, job_name) for the job whose `uses` targets deploy-apps.yml."""
    if not isinstance(doc, dict):
        return None, None
    jobs = doc.get("jobs")
    if not isinstance(jobs, dict):
        return None, None
    for name, job in jobs.items():
        if isinstance(job, dict) and "deploy-apps.yml" in str(job.get("uses", "")):
            return job, name
    return None, None


# --- T018 (R001, R007, EC004): deploy-dev.yml ---------------------------------
doc, path = load("deploy-dev.yml")
if doc is None:
    check("T018", False, f"{path} does not exist")
else:
    on = on_block(doc)
    push = on.get("push") if isinstance(on, dict) else None
    branches = push.get("branches") if isinstance(push, dict) else None
    check("T018", branches == ["develop"],
          f"expected deploy-dev.yml's on.push.branches == ['develop'], got {branches!r}")

    job, _ = deploy_apps_job(doc)
    check("T018", job is not None, "expected a job in deploy-dev.yml calling deploy-apps.yml")

    concurrency = job.get("concurrency") if isinstance(job, dict) else None
    check("T018", isinstance(concurrency, dict) and concurrency.get("group") == "deploy-dev"
          and concurrency.get("cancel-in-progress") is False,
          f"expected concurrency == {{group: 'deploy-dev', cancel-in-progress: false}}, got {concurrency!r}")

    with_block = job.get("with") if isinstance(job, dict) else None
    check("T018", isinstance(with_block, dict) and with_block.get("environment") == "dev",
          f"expected with.environment == 'dev', got {with_block.get('environment') if isinstance(with_block, dict) else with_block!r}")
    check("T018", isinstance(with_block, dict) and with_block.get("commit_sha") == "${{ github.sha }}",
          f"expected with.commit_sha == '${{{{ github.sha }}}}', got {with_block.get('commit_sha') if isinstance(with_block, dict) else with_block!r}")

# --- T020 (R002, R007, EC004): deploy-prod.yml --------------------------------
doc, path = load("deploy-prod.yml")
if doc is None:
    check("T020", False, f"{path} does not exist")
else:
    on = on_block(doc)
    push = on.get("push") if isinstance(on, dict) else None
    branches = push.get("branches") if isinstance(push, dict) else None
    check("T020", branches == ["main"],
          f"expected deploy-prod.yml's on.push.branches == ['main'], got {branches!r}")

    job, _ = deploy_apps_job(doc)
    check("T020", job is not None, "expected a job in deploy-prod.yml calling deploy-apps.yml")

    concurrency = job.get("concurrency") if isinstance(job, dict) else None
    check("T020", isinstance(concurrency, dict) and concurrency.get("group") == "deploy-prod"
          and concurrency.get("cancel-in-progress") is False,
          f"expected concurrency == {{group: 'deploy-prod', cancel-in-progress: false}}, got {concurrency!r}")

    with_block = job.get("with") if isinstance(job, dict) else None
    check("T020", isinstance(with_block, dict) and with_block.get("environment") == "prod",
          f"expected with.environment == 'prod', got {with_block.get('environment') if isinstance(with_block, dict) else with_block!r}")
    check("T020", isinstance(with_block, dict) and with_block.get("commit_sha") == "${{ github.sha }}",
          f"expected with.commit_sha == '${{{{ github.sha }}}}', got {with_block.get('commit_sha') if isinstance(with_block, dict) else with_block!r}")

# --- T023 (R003, R007, R008): deploy-manual.yml -------------------------------
doc, path = load("deploy-manual.yml")
if doc is None:
    check("T023", False, f"{path} does not exist")
else:
    on = on_block(doc)
    dispatch = on.get("workflow_dispatch") if isinstance(on, dict) else None
    inputs = dispatch.get("inputs") if isinstance(dispatch, dict) else None

    env_input = inputs.get("environment") if isinstance(inputs, dict) else None
    check("T023", isinstance(env_input, dict) and env_input.get("type") == "choice"
          and env_input.get("options") == ["dev", "prod"] and env_input.get("required") is True,
          f"expected workflow_dispatch.inputs.environment to be type: choice, options: [dev, prod], required: true, got {env_input!r}")

    sha_input = inputs.get("commit_sha") if isinstance(inputs, dict) else None
    check("T023", isinstance(sha_input, dict) and sha_input.get("type") == "string"
          and sha_input.get("required") is True,
          f"expected workflow_dispatch.inputs.commit_sha to be type: string, required: true, got {sha_input!r}")

    job, _ = deploy_apps_job(doc)
    check("T023", job is not None, "expected a job in deploy-manual.yml calling deploy-apps.yml")

    concurrency = job.get("concurrency") if isinstance(job, dict) else None
    check("T023", isinstance(concurrency, dict) and concurrency.get("group") == "deploy-${{ inputs.environment }}"
          and concurrency.get("cancel-in-progress") is False,
          f"expected concurrency == {{group: 'deploy-${{{{ inputs.environment }}}}', cancel-in-progress: false}}, got {concurrency!r}")

    with_block = job.get("with") if isinstance(job, dict) else None
    check("T023", isinstance(with_block, dict) and with_block.get("environment") == "${{ inputs.environment }}",
          f"expected with.environment == '${{{{ inputs.environment }}}}', got {with_block.get('environment') if isinstance(with_block, dict) else with_block!r}")
    check("T023", isinstance(with_block, dict) and with_block.get("commit_sha") == "${{ inputs.commit_sha }}",
          f"expected with.commit_sha == '${{{{ inputs.commit_sha }}}}', got {with_block.get('commit_sha') if isinstance(with_block, dict) else with_block!r}")

# --- T026 (R004, EC003): rollback.yml -----------------------------------------
doc, path = load("rollback.yml")
if doc is None:
    check("T026", False, f"{path} does not exist")
else:
    on = on_block(doc)
    dispatch = on.get("workflow_dispatch") if isinstance(on, dict) else None
    inputs = dispatch.get("inputs") if isinstance(dispatch, dict) else None

    env_input = inputs.get("environment") if isinstance(inputs, dict) else None
    check("T026", isinstance(env_input, dict) and env_input.get("type") == "choice"
          and env_input.get("options") == ["dev", "prod"] and env_input.get("required") is True,
          f"expected rollback.yml's workflow_dispatch.inputs.environment to match deploy-manual.yml's shape, got {env_input!r}")

    sha_input = inputs.get("commit_sha") if isinstance(inputs, dict) else None
    check("T026", isinstance(sha_input, dict) and sha_input.get("type") == "string"
          and sha_input.get("required") is True,
          f"expected rollback.yml's workflow_dispatch.inputs.commit_sha to match deploy-manual.yml's shape, got {sha_input!r}")

    deploy_job, deploy_job_name = deploy_apps_job(doc)
    check("T026", deploy_job is not None, "expected a job in rollback.yml calling deploy-apps.yml")

    concurrency = deploy_job.get("concurrency") if isinstance(deploy_job, dict) else None
    check("T026", isinstance(concurrency, dict) and concurrency.get("group") == "deploy-${{ inputs.environment }}"
          and concurrency.get("cancel-in-progress") is False,
          f"expected rollback.yml's concurrency to match deploy-manual.yml's shape, got {concurrency!r}")

    jobs = doc.get("jobs") if isinstance(doc, dict) else {}
    jobs = jobs if isinstance(jobs, dict) else {}

    warning_job_name = None
    for name, job in jobs.items():
        steps = job.get("steps") if isinstance(job, dict) else None
        if not isinstance(steps, list):
            continue
        for step in steps:
            if not isinstance(step, dict):
                continue
            run_text = str(step.get("run", "")).lower()
            if "not reverted" in run_text and "database state" in run_text:
                warning_job_name = name
                break
        if warning_job_name:
            break

    check("T026", warning_job_name is not None,
          "expected some job's step run: content to match (case-insensitively) both 'not reverted' and 'database state'")

    if warning_job_name is not None and deploy_job_name is not None:
        job_names = list(jobs.keys())
        needs = deploy_job.get("needs") if isinstance(deploy_job, dict) else None
        needs_list = needs if isinstance(needs, list) else ([needs] if isinstance(needs, str) else [])
        ordered_by_needs = warning_job_name in needs_list
        ordered_by_position = (
            warning_job_name != deploy_job_name
            and job_names.index(warning_job_name) < job_names.index(deploy_job_name)
        )
        check("T026", ordered_by_needs or ordered_by_position,
              f"expected the warning job ('{warning_job_name}') to be ordered before the job calling "
              f"deploy-apps.yml ('{deploy_job_name}'), either via 'needs' or job declaration order")
PYEOF
)"

if [ -n "$STRUCT_OUTPUT" ]; then
  echo "$STRUCT_OUTPUT"
  if echo "$STRUCT_OUTPUT" | grep -q '^FAIL:'; then
    FAILED=1
  fi
fi

exit "$FAILED"
