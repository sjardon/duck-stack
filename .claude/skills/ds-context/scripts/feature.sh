#!/usr/bin/env bash
# feature.sh — Extract a single feature entry from a module's FEATURES.md.
#
# Reads duck-spec/modules/<module>/FEATURES.md and prints only the section
# whose heading begins with <featureId> followed by whitespace, em-dash,
# colon, or hyphen.
#
# Exits non-zero if the feature is not found or FEATURES.md does not exist.
#
# Usage: feature.sh <module> <featureId>

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $(basename "$0") <module> <featureId>" >&2
  exit 1
fi

MODULE="$1"
FEATURE_ID="$2"
DOC="duck-spec/modules/$MODULE/FEATURES.md"

if [ ! -f "$DOC" ]; then
  echo "Error: $DOC not found" >&2
  exit 1
fi

OUTPUT=$(awk -v fid="$FEATURE_ID" '
  BEGIN { printing = 0; start_level = 0 }

  /^#+[[:space:]]/ {
    match($0, /^#+/)
    level = RLENGTH
    text = $0
    sub(/^#+[[:space:]]+/, "", text)
    sub(/[[:space:]]+$/, "", text)

    if (printing && level <= start_level) {
      exit
    }

    if (!printing && index(text, fid) == 1) {
      next_char = substr(text, length(fid) + 1, 1)
      if (next_char == "" || next_char ~ /[[:space:]:—-]/) {
        printing = 1
        start_level = level
        print
        next
      }
    }
  }

  printing { print }
' "$DOC")

if [ -z "$OUTPUT" ]; then
  echo "Error: feature '$FEATURE_ID' not found in $DOC" >&2
  exit 2
fi

printf '%s\n' "$OUTPUT"
