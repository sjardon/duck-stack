#!/usr/bin/env bash
# Acceptance tests for .github/scripts/pin-do-deploy-ref.sh (INFRA-012)
#
# Covers:
#   T001 (R001, R002, R003, R004) — running pin-do-deploy-ref.sh <environment>
#     <commit_sha> force-pushes <commit_sha> to
#     refs/heads/_deploy/<environment> on origin via a stub git on PATH, and
#     prints "_deploy/<environment>" on stdout — for both "dev" and "prod".
#
# This is the "test" phase of INFRA-012: .github/scripts/pin-do-deploy-ref.sh
# does not exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash .github/tests/pin-deploy-ref-script.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/pin-do-deploy-ref.sh"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# --- Stub git: records every invocation's argv. ---
STUB_BIN_DIR="$WORK_DIR/bin"
mkdir -p "$STUB_BIN_DIR"
GIT_LOG="$WORK_DIR/git.log"

cat > "$STUB_BIN_DIR/git" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$GIT_LOG"
exit 0
EOF
chmod +x "$STUB_BIN_DIR/git"

STUBBED_PATH="$STUB_BIN_DIR:$PATH"

if [ ! -f "$SCRIPT" ]; then
  fail "T001: $SCRIPT does not exist"
  exit "$FAILED"
fi
if [ ! -x "$SCRIPT" ]; then
  fail "T001: $SCRIPT is not executable"
fi

# --- T001 (R001, R002, R003, R004): "dev" ------------------------------------
DEV_SHA="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
rm -f "$GIT_LOG"
DEV_OUTPUT="$(PATH="$STUBBED_PATH" "$SCRIPT" dev "$DEV_SHA" 2>&1)"
DEV_EXIT=$?

if [ "$DEV_EXIT" -eq 0 ]; then
  pass "T001: pin-do-deploy-ref.sh dev <sha> exits 0"
else
  fail "T001: expected pin-do-deploy-ref.sh dev <sha> to exit 0, got exit $DEV_EXIT. Output:
$DEV_OUTPUT"
fi

if [ -f "$GIT_LOG" ] && grep -qF "push --force origin ${DEV_SHA}:refs/heads/_deploy/dev" "$GIT_LOG"; then
  pass "T001: pin-do-deploy-ref.sh dev <sha> invoked 'git push --force origin <sha>:refs/heads/_deploy/dev'"
else
  fail "T001: expected the stub git log ($GIT_LOG) to show 'push --force origin ${DEV_SHA}:refs/heads/_deploy/dev'. Log content: $(cat "$GIT_LOG" 2>/dev/null || echo '<no log>')"
fi

if echo "$DEV_OUTPUT" | grep -qF '_deploy/dev'; then
  pass "T001: pin-do-deploy-ref.sh dev <sha> prints '_deploy/dev' on stdout"
else
  fail "T001: expected pin-do-deploy-ref.sh dev <sha>'s output to contain '_deploy/dev'. Output:
$DEV_OUTPUT"
fi

# --- T001 (R001, R002, R003, R004): "prod", a different sha -----------------
PROD_SHA="f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5"
rm -f "$GIT_LOG"
PROD_OUTPUT="$(PATH="$STUBBED_PATH" "$SCRIPT" prod "$PROD_SHA" 2>&1)"
PROD_EXIT=$?

if [ "$PROD_EXIT" -eq 0 ]; then
  pass "T001: pin-do-deploy-ref.sh prod <sha> exits 0"
else
  fail "T001: expected pin-do-deploy-ref.sh prod <sha> to exit 0, got exit $PROD_EXIT. Output:
$PROD_OUTPUT"
fi

if [ -f "$GIT_LOG" ] && grep -qF "push --force origin ${PROD_SHA}:refs/heads/_deploy/prod" "$GIT_LOG"; then
  pass "T001: pin-do-deploy-ref.sh prod <sha> invoked 'git push --force origin <sha>:refs/heads/_deploy/prod'"
else
  fail "T001: expected the stub git log ($GIT_LOG) to show 'push --force origin ${PROD_SHA}:refs/heads/_deploy/prod'. Log content: $(cat "$GIT_LOG" 2>/dev/null || echo '<no log>')"
fi

if echo "$PROD_OUTPUT" | grep -qF '_deploy/prod'; then
  pass "T001: pin-do-deploy-ref.sh prod <sha> prints '_deploy/prod' on stdout"
else
  fail "T001: expected pin-do-deploy-ref.sh prod <sha>'s output to contain '_deploy/prod'. Output:
$PROD_OUTPUT"
fi

if [ -f "$GIT_LOG" ] && ! grep -qF "_deploy/dev" "$GIT_LOG"; then
  pass "T001: pin-do-deploy-ref.sh prod <sha> did not touch _deploy/dev"
else
  fail "T001: expected the prod run to never reference _deploy/dev. Log content: $(cat "$GIT_LOG" 2>/dev/null || echo '<no log>')"
fi

exit "$FAILED"
