#!/usr/bin/env bash
# Acceptance tests for .cloudflare/deploy.sh (INFRA-009)
#
# Covers:
#   T001 (R001)             — deploy.sh exits non-zero with a usage message when
#                              called with zero args, an invalid app selector, or a
#                              values-file path that does not exist
#   T003 (R003, EC001, NF001) — deploy.sh builds from the repo root through the pnpm
#                              workspace, producing apps/web/dist/index.html
#   T005 (R006, R007)       — VITE_* build-time variables from the values file are
#                              inlined into the built bundle
#   T007 (R006, NF001)      — a missing required variable fails fast, before any
#                              build or deploy, identifying the missing variable
#   T009 (R005, EC003)      — the SPA fallback `_redirects` file is written into
#                              the build output with the exact expected content
#   T011 (R004, R001)       — exactly the app's dist directory is deployed, to the
#                              app-defaulted project name
#   T013 (R002)             — project creation is idempotent across two
#                              consecutive runs for the same app
#   T015 (R008, R002)       — the resulting public URL is printed, with a reminder
#                              to record it in .cloudflare/README.md
#
# This is the "test" phase of INFRA-009: .cloudflare/deploy.sh does not exist yet,
# so every assertion below is expected to FAIL until the "implement" phase creates
# it (and, for T003/T005/T009/T011/T013/T015, until the later implement tasks add
# the build, fallback, and deploy steps).
#
# Run: bash .cloudflare/tests/deploy-script.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/.cloudflare/deploy.sh"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ ! -f "$DEPLOY_SCRIPT" ]; then
  fail "T001: $DEPLOY_SCRIPT does not exist"
  fail "T003: $DEPLOY_SCRIPT does not exist"
  fail "T005: $DEPLOY_SCRIPT does not exist"
  fail "T007: $DEPLOY_SCRIPT does not exist"
  fail "T009: $DEPLOY_SCRIPT does not exist"
  fail "T011: $DEPLOY_SCRIPT does not exist"
  fail "T013: $DEPLOY_SCRIPT does not exist"
  fail "T015: $DEPLOY_SCRIPT does not exist"
  exit "$FAILED"
fi
if [ ! -x "$DEPLOY_SCRIPT" ]; then
  fail "T001: $DEPLOY_SCRIPT is not executable"
fi

# --- Values files -----------------------------------------------------------

STUB_API_URL="https://api.example.test"

FULL_WEB_VALUES="$WORK_DIR/full-web.env"
cat > "$FULL_WEB_VALUES" <<EOF
CLOUDFLARE_ACCOUNT_ID=dummy-account-id
CLOUDFLARE_API_TOKEN=dummy-api-token
GIT_BRANCH=test-branch
VITE_API_URL=$STUB_API_URL
VITE_CLERK_PUBLISHABLE_KEY=pk_test_dummy
VITE_LANDING_URL=https://landing.example.test
VITE_PROVIDER_PORTAL_URL=https://portal.example.test
EOF

INCOMPLETE_WEB_VALUES="$WORK_DIR/incomplete-web.env"
grep -v '^VITE_CLERK_PUBLISHABLE_KEY=' "$FULL_WEB_VALUES" > "$INCOMPLETE_WEB_VALUES"

MISSING_VALUES_FILE="$WORK_DIR/does-not-exist.env"

# --- T001 (R001): arg / values-file validation ------------------------------

ZERO_ARGS_OUTPUT="$("$DEPLOY_SCRIPT" 2>&1)"
ZERO_ARGS_EXIT=$?
if [ "$ZERO_ARGS_EXIT" -ne 0 ]; then
  pass "T001: deploy.sh exits non-zero with zero args"
else
  fail "T001: expected deploy.sh to exit non-zero with zero args, got exit 0. Output:
$ZERO_ARGS_OUTPUT"
fi
if echo "$ZERO_ARGS_OUTPUT" | grep -qiE 'usage'; then
  pass "T001: deploy.sh prints a usage message with zero args"
else
  fail "T001: expected deploy.sh's output to mention 'usage' with zero args. Output:
$ZERO_ARGS_OUTPUT"
fi

INVALID_APP_OUTPUT="$("$DEPLOY_SCRIPT" "not-a-real-app" "$FULL_WEB_VALUES" 2>&1)"
INVALID_APP_EXIT=$?
if [ "$INVALID_APP_EXIT" -ne 0 ]; then
  pass "T001: deploy.sh exits non-zero with an invalid app selector"
else
  fail "T001: expected deploy.sh to exit non-zero with an invalid app selector, got exit 0. Output:
$INVALID_APP_OUTPUT"
fi
if echo "$INVALID_APP_OUTPUT" | grep -qiE 'usage'; then
  pass "T001: deploy.sh prints a usage message with an invalid app selector"
else
  fail "T001: expected deploy.sh's output to mention 'usage' with an invalid app selector. Output:
$INVALID_APP_OUTPUT"
fi

MISSING_FILE_OUTPUT="$("$DEPLOY_SCRIPT" web "$MISSING_VALUES_FILE" 2>&1)"
MISSING_FILE_EXIT=$?
if [ "$MISSING_FILE_EXIT" -ne 0 ]; then
  pass "T001: deploy.sh exits non-zero when the values-file path does not exist"
else
  fail "T001: expected deploy.sh to exit non-zero when the values-file path does not exist, got exit 0. Output:
$MISSING_FILE_OUTPUT"
fi
if echo "$MISSING_FILE_OUTPUT" | grep -qiE 'usage'; then
  pass "T001: deploy.sh prints a usage message when the values-file path does not exist"
else
  fail "T001: expected deploy.sh's output to mention 'usage' when the values-file path does not exist. Output:
$MISSING_FILE_OUTPUT"
fi

# --- Stub wrangler: records every invocation's argv, simulates an idempotent
#     `pages project create` (fails with "already exists" on its Nth call, N
#     configurable per test via a counter file), and prints a fixed
#     https://*.pages.dev URL for `pages deploy`. ---
make_wrangler_stub() {
  local bin_dir="$1" log_file="$2" counter_file="$3" fail_from_count="$4" deploy_url="$5"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/wrangler" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$log_file"
if [[ "\$1" == "pages" && "\$2" == "project" && "\$3" == "create" ]]; then
  count=0
  [ -f "$counter_file" ] && count="\$(cat "$counter_file")"
  count=\$((count + 1))
  echo "\$count" > "$counter_file"
  if [ "$fail_from_count" -gt 0 ] && [ "\$count" -ge "$fail_from_count" ]; then
    echo "Error: A project with this name already exists." >&2
    exit 1
  fi
  exit 0
fi
if [[ "\$1" == "pages" && "\$2" == "deploy" ]]; then
  echo "$deploy_url"
  exit 0
fi
exit 0
EOF
  chmod +x "$bin_dir/wrangler"
}

# --- T003, T005, T009, T011, T015: one full, successful run for `web` -------
FULL_RUN_DIR="$WORK_DIR/full-run"
mkdir -p "$FULL_RUN_DIR"
FULL_RUN_WRANGLER_LOG="$FULL_RUN_DIR/wrangler.log"
FULL_RUN_COUNTER="$FULL_RUN_DIR/project-create-count"
STUB_DEPLOY_URL="https://abc123.duck-stack-web.pages.dev"
make_wrangler_stub "$FULL_RUN_DIR/bin" "$FULL_RUN_WRANGLER_LOG" "$FULL_RUN_COUNTER" 0 "$STUB_DEPLOY_URL"

WEB_DIST="$REPO_ROOT/apps/web/dist"
rm -rf "$WEB_DIST"

FULL_RUN_OUTPUT="$(PATH="$FULL_RUN_DIR/bin:$PATH" "$DEPLOY_SCRIPT" web "$FULL_WEB_VALUES" 2>&1)"
FULL_RUN_EXIT=$?

if [ "$FULL_RUN_EXIT" -eq 0 ]; then
  pass "T003/T005/T009/T011/T015: deploy.sh web exits 0 on a full, valid run"
else
  fail "T003/T005/T009/T011/T015: expected deploy.sh web to exit 0, got exit $FULL_RUN_EXIT. Output:
$FULL_RUN_OUTPUT"
fi

# T003 (R003, EC001, NF001)
if [ -f "$WEB_DIST/index.html" ]; then
  pass "T003: apps/web/dist/index.html exists after deploy.sh web (build ran from the repo root through the pnpm workspace)"
else
  fail "T003: expected $WEB_DIST/index.html to exist after deploy.sh web"
fi

# T005 (R006, R007)
if [ -d "$WEB_DIST" ] && grep -rqF "$STUB_API_URL" "$WEB_DIST" 2>/dev/null; then
  pass "T005: the built bundle under apps/web/dist contains the inlined VITE_API_URL value ($STUB_API_URL)"
else
  fail "T005: expected apps/web/dist to contain the literal string '$STUB_API_URL' inlined by the build"
fi

# T009 (R005, EC003)
REDIRECTS_FILE="$WEB_DIST/_redirects"
if [ -f "$REDIRECTS_FILE" ]; then
  REDIRECTS_CONTENT="$(cat "$REDIRECTS_FILE")"
  if [ "$REDIRECTS_CONTENT" = "/* /index.html 200" ]; then
    pass "T009: apps/web/dist/_redirects contains exactly '/* /index.html 200'"
  else
    fail "T009: expected apps/web/dist/_redirects to contain exactly '/* /index.html 200', got: '$REDIRECTS_CONTENT'"
  fi
else
  fail "T009: expected $REDIRECTS_FILE to exist"
fi

# T011 (R004, R001)
if [ -f "$FULL_RUN_WRANGLER_LOG" ] && grep -qF 'pages deploy' "$FULL_RUN_WRANGLER_LOG"; then
  DEPLOY_LINE="$(grep -F 'pages deploy' "$FULL_RUN_WRANGLER_LOG" | head -1)"
  if echo "$DEPLOY_LINE" | grep -qE '(^| )apps/web/dist( |$)' && echo "$DEPLOY_LINE" | grep -qF -- '--project-name duck-stack-web'; then
    pass "T011: 'wrangler pages deploy' was invoked with directory 'apps/web/dist' and --project-name 'duck-stack-web'"
  else
    fail "T011: expected the recorded 'wrangler pages deploy' line to use directory 'apps/web/dist' and --project-name 'duck-stack-web'. Line: $DEPLOY_LINE"
  fi
else
  fail "T011: expected the stub wrangler log ($FULL_RUN_WRANGLER_LOG) to show a 'pages deploy' invocation"
fi

# T015 (R008, R002)
if echo "$FULL_RUN_OUTPUT" | grep -qF "$STUB_DEPLOY_URL"; then
  pass "T015: deploy.sh's output contains the public URL returned by wrangler ($STUB_DEPLOY_URL)"
else
  fail "T015: expected deploy.sh's output to contain the public URL '$STUB_DEPLOY_URL'. Output:
$FULL_RUN_OUTPUT"
fi
if echo "$FULL_RUN_OUTPUT" | grep -qiE 'record|current deployments' && echo "$FULL_RUN_OUTPUT" | grep -qF '.cloudflare/README.md'; then
  pass "T015: deploy.sh's output reminds the operator to record the URL in .cloudflare/README.md"
else
  fail "T015: expected deploy.sh's output to remind the operator to record the URL in .cloudflare/README.md. Output:
$FULL_RUN_OUTPUT"
fi

# --- T013 (R002): idempotent project creation across two consecutive runs ---
IDEMPOTENT_DIR="$WORK_DIR/idempotent-run"
mkdir -p "$IDEMPOTENT_DIR"
IDEMPOTENT_WRANGLER_LOG="$IDEMPOTENT_DIR/wrangler.log"
IDEMPOTENT_COUNTER="$IDEMPOTENT_DIR/project-create-count"
# fail_from_count=2: the first 'pages project create' call (first deploy.sh run)
# succeeds; the second call (second deploy.sh run, same app) fails with
# "already exists", simulating a pre-existing Pages project.
make_wrangler_stub "$IDEMPOTENT_DIR/bin" "$IDEMPOTENT_WRANGLER_LOG" "$IDEMPOTENT_COUNTER" 2 "$STUB_DEPLOY_URL"

FIRST_RUN_OUTPUT="$(PATH="$IDEMPOTENT_DIR/bin:$PATH" "$DEPLOY_SCRIPT" web "$FULL_WEB_VALUES" 2>&1)"
FIRST_RUN_EXIT=$?
SECOND_RUN_OUTPUT="$(PATH="$IDEMPOTENT_DIR/bin:$PATH" "$DEPLOY_SCRIPT" web "$FULL_WEB_VALUES" 2>&1)"
SECOND_RUN_EXIT=$?

if [ "$FIRST_RUN_EXIT" -eq 0 ] && [ "$SECOND_RUN_EXIT" -eq 0 ]; then
  pass "T013: two consecutive deploy.sh web runs both exit 0, the second tolerating an 'already exists' project-create failure"
else
  fail "T013: expected both consecutive deploy.sh web runs to exit 0 (first: $FIRST_RUN_EXIT, second: $SECOND_RUN_EXIT). First output:
$FIRST_RUN_OUTPUT
Second output:
$SECOND_RUN_OUTPUT"
fi

# --- T007 (R006, NF001): missing required variable fails fast --------------
INCOMPLETE_DIR="$WORK_DIR/incomplete-run"
mkdir -p "$INCOMPLETE_DIR"
INCOMPLETE_WRANGLER_LOG="$INCOMPLETE_DIR/wrangler.log"
INCOMPLETE_PNPM_LOG="$INCOMPLETE_DIR/pnpm.log"
make_wrangler_stub "$INCOMPLETE_DIR/bin" "$INCOMPLETE_WRANGLER_LOG" "$INCOMPLETE_DIR/project-create-count" 0 "$STUB_DEPLOY_URL"
cat > "$INCOMPLETE_DIR/bin/pnpm" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$INCOMPLETE_PNPM_LOG"
exit 0
EOF
chmod +x "$INCOMPLETE_DIR/bin/pnpm"

INCOMPLETE_RUN_OUTPUT="$(PATH="$INCOMPLETE_DIR/bin:$PATH" "$DEPLOY_SCRIPT" web "$INCOMPLETE_WEB_VALUES" 2>&1)"
INCOMPLETE_RUN_EXIT=$?

if [ "$INCOMPLETE_RUN_EXIT" -ne 0 ]; then
  pass "T007: deploy.sh web exits non-zero when VITE_CLERK_PUBLISHABLE_KEY is missing"
else
  fail "T007: expected deploy.sh web to exit non-zero when VITE_CLERK_PUBLISHABLE_KEY is missing, got exit 0. Output:
$INCOMPLETE_RUN_OUTPUT"
fi
if echo "$INCOMPLETE_RUN_OUTPUT" | grep -qF 'VITE_CLERK_PUBLISHABLE_KEY'; then
  pass "T007: deploy.sh web's error output identifies VITE_CLERK_PUBLISHABLE_KEY as the missing variable"
else
  fail "T007: expected deploy.sh web's error output to identify VITE_CLERK_PUBLISHABLE_KEY as missing. Output:
$INCOMPLETE_RUN_OUTPUT"
fi
if [ ! -s "$INCOMPLETE_PNPM_LOG" ]; then
  pass "T007: deploy.sh did not invoke pnpm (no build) when a required variable is missing"
else
  fail "T007: expected pnpm to never be invoked when a required variable is missing, but it was: $(cat "$INCOMPLETE_PNPM_LOG")"
fi
if [ ! -s "$INCOMPLETE_WRANGLER_LOG" ]; then
  pass "T007: deploy.sh did not invoke the stub wrangler when a required variable is missing"
else
  fail "T007: expected the stub wrangler to never be invoked when a required variable is missing, but it was: $(cat "$INCOMPLETE_WRANGLER_LOG")"
fi

exit "$FAILED"
