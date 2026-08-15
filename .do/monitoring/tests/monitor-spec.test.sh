#!/usr/bin/env bash
# Acceptance tests for .do/monitoring/monitor.json (INFRA-011)
#
# Covers:
#   T007 (R001, R002, NF003) — monitor_type == "status", url ==
#                               "${BETTERSTACK_MONITOR_URL}", check_frequency ==
#                               "${BETTERSTACK_CHECK_FREQUENCY_SECONDS}" (as the raw,
#                               unrendered placeholder), request_timeout ==
#                               "${BETTERSTACK_CHECK_TIMEOUT_SECONDS}" (as the raw,
#                               unrendered placeholder)
#   T009 (R003, R004)        — email == true, pronounceable_name contains the
#                               literal substring "${DO_APP_NAME}"
#
# monitor.json is a *template*: check_frequency and request_timeout are bare
# ${VAR} placeholders (not quoted strings), so the unrendered file is not
# itself valid JSON — envsubst renders it before it is ever parsed as JSON by
# .do/monitoring/deploy.sh. This script therefore extracts each field's raw
# source text with a small, per-field regex (mirroring the structural-check
# style of .do/tests/app-spec.test.sh) rather than calling json.loads on the
# unrendered file.
#
# This is the "test" phase of INFRA-011: .do/monitoring/monitor.json does not
# exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash .do/monitoring/tests/monitor-spec.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MONITOR_FILE="$REPO_ROOT/.do/monitoring/monitor.json"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

if [ ! -f "$MONITOR_FILE" ]; then
  fail "T007: $MONITOR_FILE does not exist"
  fail "T009: $MONITOR_FILE does not exist"
  exit "$FAILED"
fi

STRUCT_OUTPUT="$(python3 - "$MONITOR_FILE" <<'PYEOF'
import re
import sys

path = sys.argv[1]

def check(task, cond, detail):
    print(f"{'PASS' if cond else 'FAIL'}: {task}: {detail}")

with open(path) as f:
    raw = f.read()

def extract_string_field(name):
    m = re.search(r'"%s"\s*:\s*"([^"]*)"' % re.escape(name), raw)
    return m.group(1) if m else None

def extract_raw_field(name):
    # Value is either a bare ${VAR} placeholder (unrendered template) or a
    # plain literal (true/false/number) once rendered, matched explicitly so
    # the placeholder closing brace is not mistaken for the JSON object one.
    m = re.search(r'"%s"\s*:\s*(\$\{[A-Z0-9_]+\}|[A-Za-z0-9_.]+)' % re.escape(name), raw)
    return m.group(1).strip() if m else None

# --- T007 (R001, R002, NF003) ---
monitor_type = extract_string_field("monitor_type")
check("T007", monitor_type == "status",
      f"expected monitor_type == 'status', got {monitor_type!r}")

url = extract_string_field("url")
check("T007", url == "${BETTERSTACK_MONITOR_URL}",
      f"expected url == '${{BETTERSTACK_MONITOR_URL}}', got {url!r}")

check_frequency = extract_raw_field("check_frequency")
check("T007", check_frequency == "${BETTERSTACK_CHECK_FREQUENCY_SECONDS}",
      f"expected check_frequency == '${{BETTERSTACK_CHECK_FREQUENCY_SECONDS}}' "
      f"(unrendered), got {check_frequency!r}")

request_timeout = extract_raw_field("request_timeout")
check("T007", request_timeout == "${BETTERSTACK_CHECK_TIMEOUT_SECONDS}",
      f"expected request_timeout == '${{BETTERSTACK_CHECK_TIMEOUT_SECONDS}}' "
      f"(unrendered), got {request_timeout!r}")

# --- T009 (R003, R004) ---
email_raw = extract_raw_field("email")
check("T009", email_raw == "true",
      f"expected email == true, got {email_raw!r}")

pronounceable_name = extract_string_field("pronounceable_name")
check("T009", pronounceable_name is not None and "${DO_APP_NAME}" in pronounceable_name,
      f"expected pronounceable_name to contain the literal substring "
      f"'${{DO_APP_NAME}}', got {pronounceable_name!r}")
PYEOF
)"

echo "$STRUCT_OUTPUT"
if echo "$STRUCT_OUTPUT" | grep -q '^FAIL:'; then
  FAILED=1
fi

exit "$FAILED"
