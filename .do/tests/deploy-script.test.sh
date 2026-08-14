#!/usr/bin/env bash
# Acceptance tests for .do/deploy.sh (INFRA-008)
#
# Covers:
#   T016 (R010, NF001)  — deploy.sh invokes `doctl apps create` with --spec, --upsert
#                          and --wait, via a stub doctl on PATH that records its argv
#   T018 (EC002, R006)  — running deploy.sh with a values file missing
#                          EMAIL_SENDER_ADDRESS exits non-zero, prints a message
#                          identifying the missing variable, and never invokes doctl
#   T020 (R011, R003)   — given the stub doctl returns a fixed ID and DefaultIngress,
#                          deploy.sh's stdout contains that URL and a reminder to
#                          record it in .do/README.md
#
# This is the "test" phase of INFRA-008: .do/deploy.sh does not exist yet, so every
# assertion below is expected to FAIL until the "implement" phase creates it.
#
# Run: bash .do/tests/deploy-script.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/.do/deploy.sh"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# --- Stub doctl: records every invocation's argv and, when asked to create an
#     app, prints a fixed ID / DefaultIngress pair in the --format ID,DefaultIngress
#     --no-header layout deploy.sh is expected to parse. ---
STUB_BIN_DIR="$WORK_DIR/bin"
mkdir -p "$STUB_BIN_DIR"
DOCTL_LOG="$WORK_DIR/doctl.log"
STUB_APP_ID="stub-app-id-12345"
STUB_URL="https://stub-app-abcde.ondigitalocean.app"

cat > "$STUB_BIN_DIR/doctl" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$DOCTL_LOG"
if [[ "\$1" == "apps" && "\$2" == "create" ]]; then
  printf '%s\t%s\n' "$STUB_APP_ID" "$STUB_URL"
fi
exit 0
EOF
chmod +x "$STUB_BIN_DIR/doctl"

STUBBED_PATH="$STUB_BIN_DIR:$PATH"

# --- Required placeholders referenced by .do/app.yaml (R006 + app-level vars) ---
REQUIRED_VARS=(
  DO_APP_NAME GITHUB_REPO GIT_BRANCH
  NODE_ENV LOG_LEVEL HOST PORT CORS_ORIGIN DATABASE_URL
  CLERK_SECRET_KEY CLERK_JWT_KEY CLERK_WEBHOOK_SIGNING_SECRET
  EMAIL_SENDER_ADDRESS RESEND_API_KEY BILLING_PROVIDER
  MOBBEX_API_KEY MOBBEX_ACCESS_TOKEN MOBBEX_TEST_MODE MOBBEX_TIMEOUT_MS MOBBEX_WEBHOOK_SECRET
  SIGNUP_MODE FREE_TRIAL_DAYS STRICT_ENTITLEMENTS_ON_PAST_DUE
)

FULL_VALUES_FILE="$WORK_DIR/full.env"
: > "$FULL_VALUES_FILE"
for var in "${REQUIRED_VARS[@]}"; do
  echo "${var}=dummy-value" >> "$FULL_VALUES_FILE"
done

INCOMPLETE_VALUES_FILE="$WORK_DIR/incomplete.env"
grep -v '^EMAIL_SENDER_ADDRESS=' "$FULL_VALUES_FILE" > "$INCOMPLETE_VALUES_FILE"

if [ ! -f "$DEPLOY_SCRIPT" ]; then
  fail "T016: $DEPLOY_SCRIPT does not exist"
  fail "T018: $DEPLOY_SCRIPT does not exist"
  fail "T020: $DEPLOY_SCRIPT does not exist"
  exit "$FAILED"
fi
if [ ! -x "$DEPLOY_SCRIPT" ]; then
  fail "T016: $DEPLOY_SCRIPT is not executable"
fi

# --- T016 (R010, NF001) & T020 (R011, R003): full run with every placeholder set ---
rm -f "$DOCTL_LOG"
FULL_RUN_OUTPUT="$(PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$FULL_VALUES_FILE" 2>&1)"
FULL_RUN_EXIT=$?

if [ "$FULL_RUN_EXIT" -eq 0 ]; then
  pass "T016: deploy.sh exits 0 when every required placeholder is set"
else
  fail "T016: expected deploy.sh to exit 0 with a complete values file, got exit $FULL_RUN_EXIT. Output:
$FULL_RUN_OUTPUT"
fi

if [ -f "$DOCTL_LOG" ] && grep -q -- '--spec' "$DOCTL_LOG" && grep -q -- '--upsert' "$DOCTL_LOG" && grep -q -- '--wait' "$DOCTL_LOG" && grep -qE '(^| )apps( |$)' "$DOCTL_LOG" && grep -qE '(^| )create( |$)' "$DOCTL_LOG"; then
  pass "T016: deploy.sh invoked 'doctl apps create' with --spec, --upsert and --wait"
else
  fail "T016: expected the stub doctl log ($DOCTL_LOG) to show 'apps create' invoked with --spec, --upsert and --wait. Log content: $(cat "$DOCTL_LOG" 2>/dev/null || echo '<no log>')"
fi

if echo "$FULL_RUN_OUTPUT" | grep -qF "$STUB_URL"; then
  pass "T020: deploy.sh's output contains the public URL returned by doctl ($STUB_URL)"
else
  fail "T020: expected deploy.sh's output to contain the public URL '$STUB_URL'. Output:
$FULL_RUN_OUTPUT"
fi

if echo "$FULL_RUN_OUTPUT" | grep -qiE 'record|current deployments' && echo "$FULL_RUN_OUTPUT" | grep -qF '.do/README.md'; then
  pass "T020: deploy.sh's output reminds the operator to record the URL in .do/README.md"
else
  fail "T020: expected deploy.sh's output to remind the operator to record the URL in .do/README.md. Output:
$FULL_RUN_OUTPUT"
fi

# --- T018 (EC002, R006): fails fast on a missing required variable ---
rm -f "$DOCTL_LOG"
INCOMPLETE_RUN_OUTPUT="$(PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$INCOMPLETE_VALUES_FILE" 2>&1)"
INCOMPLETE_RUN_EXIT=$?

if [ "$INCOMPLETE_RUN_EXIT" -ne 0 ]; then
  pass "T018: deploy.sh exits non-zero when EMAIL_SENDER_ADDRESS is missing"
else
  fail "T018: expected deploy.sh to exit non-zero when EMAIL_SENDER_ADDRESS is missing, got exit 0. Output:
$INCOMPLETE_RUN_OUTPUT"
fi

if echo "$INCOMPLETE_RUN_OUTPUT" | grep -qF 'EMAIL_SENDER_ADDRESS'; then
  pass "T018: deploy.sh's error output identifies EMAIL_SENDER_ADDRESS as the missing variable"
else
  fail "T018: expected deploy.sh's error output to identify EMAIL_SENDER_ADDRESS as missing. Output:
$INCOMPLETE_RUN_OUTPUT"
fi

if [ ! -s "$DOCTL_LOG" ]; then
  pass "T018: deploy.sh did not invoke the stub doctl when a required variable is missing"
else
  fail "T018: expected the stub doctl to never be invoked when EMAIL_SENDER_ADDRESS is missing, but it was: $(cat "$DOCTL_LOG")"
fi

exit "$FAILED"
