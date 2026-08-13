#!/usr/bin/env bash
# Acceptance tests for .do/app.yaml (INFRA-008)
#
# Covers:
#   T001 (R001)              — spec file exists, is valid YAML, name == ${DO_APP_NAME}
#   T003 (R002)               — exactly one service component named "services" with a
#                                non-empty http_port
#   T005 (R004, R005, EC001)  — source_dir == "/", dockerfile_path ==
#                                "apps/services/Dockerfile", and (best-effort, only if
#                                docker is available and reachable) the image builds
#                                from the repo root using that Dockerfile
#   T007 (R006)                — envs declares exactly the 19 required keys, each with
#                                scope RUN_TIME and value "${<KEY>}"
#   T009 (R008)                — the 7 sensitive keys are type: secret, every other
#                                declared key is type: general
#   T011 (R009, EC006)         — health_check.http_path == "/health" and both
#                                health_check.port and http_port resolve to the same
#                                placeholder as the PORT env entry's value
#   T013 (EC004)                — the SES_REGION entry is immediately preceded by a
#                                comment referencing the decommissioned AWS SES
#                                integration
#
# This is the "test" phase of INFRA-008: .do/app.yaml does not exist yet, so every
# assertion below is expected to FAIL until the "implement" phase creates it.
#
# Run: bash .do/tests/app-spec.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPEC_FILE="$REPO_ROOT/.do/app.yaml"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }
skip() { echo "SKIP: $1"; }

if [ ! -f "$SPEC_FILE" ]; then
  fail "T001: $SPEC_FILE does not exist"
fi

# --- Structural assertions (T001, T003, T005, T007, T009, T011) ---
# Parsed once with Python/PyYAML and reported as PASS/FAIL lines so this
# script stays a single source of truth for the YAML structure checks.
STRUCT_OUTPUT="$(python3 - "$SPEC_FILE" <<'PYEOF'
import sys

path = sys.argv[1]

try:
    import yaml
except ImportError:
    print("FAIL: T001: PyYAML is not installed; cannot parse .do/app.yaml")
    sys.exit(0)

def check(task, cond, detail):
    print(f"{'PASS' if cond else 'FAIL'}: {task}: {detail}")

try:
    with open(path) as f:
        raw = f.read()
except FileNotFoundError:
    # Already reported by the bash wrapper above.
    sys.exit(0)

try:
    spec = yaml.safe_load(raw)
except Exception as exc:
    check("T001", False, f"expected {path} to parse as valid YAML, got error: {exc}")
    sys.exit(0)

check("T001", isinstance(spec, dict), "expected the document root to be a mapping")

name = spec.get("name") if isinstance(spec, dict) else None
check("T001", name == "${DO_APP_NAME}",
      f"expected top-level 'name' == '${{DO_APP_NAME}}', got {name!r}")

services = spec.get("services") if isinstance(spec, dict) else None

# T003 (R002)
check("T003", isinstance(services, list) and len(services) == 1,
      f"expected exactly 1 entry under 'services', got "
      f"{len(services) if isinstance(services, list) else type(services).__name__}")

svc = services[0] if isinstance(services, list) and len(services) == 1 and isinstance(services[0], dict) else {}

check("T003", svc.get("name") == "services",
      f"expected services[0].name == 'services', got {svc.get('name')!r}")
check("T003", bool(svc.get("http_port")),
      f"expected services[0].http_port to be a non-empty value, got {svc.get('http_port')!r}")

# T005 (R004, R005, EC001)
check("T005", svc.get("source_dir") == "/",
      f"expected services[0].source_dir == '/', got {svc.get('source_dir')!r}")
check("T005", svc.get("dockerfile_path") == "apps/services/Dockerfile",
      f"expected services[0].dockerfile_path == 'apps/services/Dockerfile', got "
      f"{svc.get('dockerfile_path')!r}")

# T007 (R006)
REQUIRED_ENV_KEYS = [
    "NODE_ENV", "LOG_LEVEL", "HOST", "PORT", "CORS_ORIGIN", "DATABASE_URL",
    "CLERK_SECRET_KEY", "CLERK_JWT_KEY", "CLERK_WEBHOOK_SIGNING_SECRET",
    "EMAIL_SENDER_ADDRESS", "SES_REGION", "BILLING_PROVIDER",
    "MOBBEX_API_KEY", "MOBBEX_ACCESS_TOKEN", "MOBBEX_TEST_MODE",
    "MOBBEX_TIMEOUT_MS", "MOBBEX_WEBHOOK_SECRET", "SIGNUP_MODE",
    "FREE_TRIAL_DAYS", "STRICT_ENTITLEMENTS_ON_PAST_DUE",
]

envs = svc.get("envs")
envs_by_key = {}
if isinstance(envs, list):
    for e in envs:
        if isinstance(e, dict) and "key" in e:
            envs_by_key[e["key"]] = e

declared_keys = set(envs_by_key.keys())
required_keys = set(REQUIRED_ENV_KEYS)

check("T007", declared_keys == required_keys,
      f"expected services[0].envs keys to equal {sorted(required_keys)}, got "
      f"{sorted(declared_keys)} (missing: {sorted(required_keys - declared_keys)}, "
      f"unexpected: {sorted(declared_keys - required_keys)})")

for key in REQUIRED_ENV_KEYS:
    entry = envs_by_key.get(key)
    check("T007", entry is not None and entry.get("scope") == "RUN_TIME",
          f"expected envs[{key}].scope == 'RUN_TIME', got "
          f"{entry.get('scope') if entry else '<missing>'}")
    expected_value = f"${{{key}}}"
    check("T007", entry is not None and entry.get("value") == expected_value,
          f"expected envs[{key}].value == '{expected_value}', got "
          f"{entry.get('value') if entry else '<missing>'!r}")

# T009 (R008)
SECRET_KEYS = {
    "DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_JWT_KEY",
    "CLERK_WEBHOOK_SIGNING_SECRET", "MOBBEX_API_KEY",
    "MOBBEX_ACCESS_TOKEN", "MOBBEX_WEBHOOK_SECRET",
}
for key in REQUIRED_ENV_KEYS:
    entry = envs_by_key.get(key)
    expected_type = "secret" if key in SECRET_KEYS else "general"
    actual_type = entry.get("type") if entry else None
    check("T009", actual_type == expected_type,
          f"expected envs[{key}].type == '{expected_type}', got {actual_type!r}")

# T011 (R009, EC006)
health = svc.get("health_check")
http_path = health.get("http_path") if isinstance(health, dict) else None
check("T011", http_path == "/health",
      f"expected services[0].health_check.http_path == '/health', got {http_path!r}")

port_env_value = envs_by_key.get("PORT", {}).get("value")
http_port = svc.get("http_port")
health_port = health.get("port") if isinstance(health, dict) else None

check("T011", port_env_value is not None and http_port == port_env_value,
      f"expected services[0].http_port == PORT env value ({port_env_value!r}), got {http_port!r}")
check("T011", port_env_value is not None and health_port == port_env_value,
      f"expected services[0].health_check.port == PORT env value ({port_env_value!r}), got {health_port!r}")
PYEOF
)"

if [ -n "$STRUCT_OUTPUT" ]; then
  echo "$STRUCT_OUTPUT"
  if echo "$STRUCT_OUTPUT" | grep -q '^FAIL:'; then
    FAILED=1
  fi
fi

# --- T005 (R004, R005, EC001), docker-build portion — best effort only ---
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if [ -f "$REPO_ROOT/apps/services/Dockerfile" ]; then
    if (cd "$REPO_ROOT" && docker build -f apps/services/Dockerfile --target builder . >/tmp/infra-008-docker-build.log 2>&1); then
      pass "T005: docker build -f apps/services/Dockerfile --target builder . (from repo root) exits 0"
    else
      fail "T005: docker build -f apps/services/Dockerfile --target builder . (from repo root) failed; see /tmp/infra-008-docker-build.log"
    fi
  else
    fail "T005: $REPO_ROOT/apps/services/Dockerfile does not exist"
  fi
else
  skip "T005: docker is not available or its daemon is not reachable; skipping the build check"
fi

# --- T013 (EC004): SES_REGION preceded by a decommissioned-AWS-SES comment ---
if [ -f "$SPEC_FILE" ]; then
  line_no="$(grep -n 'key:[[:space:]]*SES_REGION' "$SPEC_FILE" | head -1 | cut -d: -f1)"
  if [ -z "$line_no" ]; then
    fail "T013: no 'key: SES_REGION' entry found in $SPEC_FILE"
  else
    prev_line_no=$((line_no - 1))
    prev_line="$(sed -n "${prev_line_no}p" "$SPEC_FILE")"
    trimmed="$(printf '%s' "$prev_line" | sed -e 's/^[[:space:]]*//')"
    if [[ "$trimmed" == \#* ]] && printf '%s' "$trimmed" | grep -qiE 'ses|aws'; then
      pass "T013: the line immediately before 'key: SES_REGION' is a comment referencing the decommissioned AWS SES integration"
    else
      fail "T013: expected the line immediately before 'key: SES_REGION' (line $line_no of $SPEC_FILE) to be a comment mentioning AWS SES, got: '$prev_line'"
    fi
  fi
else
  fail "T013: $SPEC_FILE does not exist"
fi

exit "$FAILED"
