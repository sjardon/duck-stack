#!/usr/bin/env bash
# .cloudflare/deploy.sh — build a SPA (web or landing) from the monorepo root
# and publish it to its Cloudflare Pages project via `wrangler pages deploy`
# (INFRA-009: R001, R002, R003, R004, R005, R006, R007, R008, EC001, EC003).
#
# Usage: .cloudflare/deploy.sh <web|landing> <values-file>
#
# <values-file> is a shell-sourceable file declaring every placeholder this
# script needs (see .cloudflare/.env.deploy.web.example and
# .cloudflare/.env.deploy.landing.example). Copy the app's example file to
# .cloudflare/.env.deploy.<app>.<environment>, fill in the real values, and
# pass its path here. See .cloudflare/README.md for the full procedure and
# prerequisites.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Usage -------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: .cloudflare/deploy.sh <web|landing> <values-file>

<app> must be exactly "web" or "landing".

<values-file> is a shell-sourceable file declaring every placeholder this
script needs (see .cloudflare/.env.deploy.web.example and
.cloudflare/.env.deploy.landing.example). Copy the app's example file to
.cloudflare/.env.deploy.<app>.<environment>, fill in the real values, and
pass its path here.
EOF
}

# Prints "$1" as an error, followed by the usage block, then exits 1.
usage_error() {
  echo "Error: $1" >&2
  usage >&2
  exit 1
}

# --- Arg validation (T002, R001) --------------------------------------------
# Validates $1 is "web"/"landing" and $2 is an existing values-file path.
# Sets the globals APP and VALUES_FILE for the rest of the script.

validate_args() {
  if [ "$#" -ne 2 ]; then
    usage >&2
    exit 1
  fi

  APP="$1"
  VALUES_FILE="$2"

  if [ "$APP" != "web" ] && [ "$APP" != "landing" ]; then
    usage_error "app must be 'web' or 'landing', got '$APP'."
  fi

  if [ ! -f "$VALUES_FILE" ]; then
    usage_error "values file '$VALUES_FILE' does not exist."
  fi
}

# --- Required-variable validation (T008, R006) ------------------------------
# Fails fast, before any build or deploy, identifying the missing variable.
# Also resolves the CLOUDFLARE_PROJECT_NAME/PRODUCTION_BRANCH defaults.

validate_required_vars() {
  : "${CLOUDFLARE_ACCOUNT_ID:?missing CLOUDFLARE_ACCOUNT_ID — see .cloudflare/README.md}"
  : "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN — see .cloudflare/README.md}"
  : "${GIT_BRANCH:?missing GIT_BRANCH — see .cloudflare/README.md}"

  if [ "$APP" = "web" ]; then
    : "${VITE_API_URL:?missing VITE_API_URL — see .cloudflare/README.md}"
    : "${VITE_CLERK_PUBLISHABLE_KEY:?missing VITE_CLERK_PUBLISHABLE_KEY — see .cloudflare/README.md}"
    : "${VITE_LANDING_URL:?missing VITE_LANDING_URL — see .cloudflare/README.md}"
    : "${VITE_PROVIDER_PORTAL_URL:?missing VITE_PROVIDER_PORTAL_URL — see .cloudflare/README.md}"
  else
    : "${VITE_API_URL:?missing VITE_API_URL — see .cloudflare/README.md}"
    : "${VITE_WEB_URL:?missing VITE_WEB_URL — see .cloudflare/README.md}"
  fi

  CLOUDFLARE_PROJECT_NAME="${CLOUDFLARE_PROJECT_NAME:-duck-stack-$APP}"
  PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"
}

# Resolves `wrangler`: prefers a copy already reachable on PATH (used to
# stub the binary under test), otherwise falls back to `pnpm exec wrangler`
# so it resolves from the pinned workspace lockfile dependency rather than
# an ad hoc network fetch (NF001). Sets the global array WRANGLER_CMD.
resolve_wrangler_cmd() {
  if command -v wrangler >/dev/null 2>&1; then
    WRANGLER_CMD=(wrangler)
  else
    WRANGLER_CMD=(pnpm exec wrangler)
  fi
}

# --- Build (T004, R003, EC001, NF001) ---------------------------------------
# Runs from the repo root through the pnpm workspace so workspace:*
# dependencies resolve.

build_app() {
  cd "$REPO_ROOT"
  pnpm install --frozen-lockfile
  pnpm --filter "$APP" build
}

# --- SPA fallback (T010, R005, EC003) ---------------------------------------

write_redirects() {
  printf '%s\n' '/* /index.html 200' > "$REPO_ROOT/$DIST_DIR/_redirects"
}

# --- Idempotent project creation (T014, R002) -------------------------------
# Tolerates an "already exists" failure so re-running for the same app never
# fails the run.

ensure_project() {
  "${WRANGLER_CMD[@]}" pages project create "$CLOUDFLARE_PROJECT_NAME" \
    --production-branch "$PRODUCTION_BRANCH" || true
}

# --- Deploy + public URL output (T012, T016, R004, R001, R008, R002) --------
# Publishes exactly apps/<app>/dist, nothing else in the monorepo, then
# parses the resulting public URL from wrangler's stdout and prints it.

deploy_and_print_url() {
  local wrangler_output
  wrangler_output="$("${WRANGLER_CMD[@]}" pages deploy "$DIST_DIR" \
    --project-name "$CLOUDFLARE_PROJECT_NAME" \
    --branch "$GIT_BRANCH")"

  echo "$wrangler_output"

  local public_url
  public_url="$(printf '%s\n' "$wrangler_output" | grep -oE 'https://[A-Za-z0-9.-]+\.pages\.dev' | head -1)"

  if [ -n "$public_url" ]; then
    echo "Public URL: $public_url"
  fi
  echo "Record this URL under 'Current deployments' in .cloudflare/README.md."
}

# --- Main ---------------------------------------------------------------

main() {
  validate_args "$@"

  DIST_DIR="apps/$APP/dist"

  # Exports every variable in the values file, including the VITE_* build-time
  # variables, into the shell so the build step below inlines them
  # (T006, R006, R007).
  set -a
  # shellcheck disable=SC1090
  source "$VALUES_FILE"
  set +a

  validate_required_vars
  resolve_wrangler_cmd

  build_app
  write_redirects
  ensure_project
  deploy_and_print_url
}

main "$@"
