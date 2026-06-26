#!/usr/bin/env bash
# section.sh — Extract a single section from a markdown file.
#
# Prints the heading line plus everything until the next heading at the same
# or higher level. Nested subsections are included.
#
# Heading text must match exactly (case-sensitive, excluding leading '#'s
# and surrounding whitespace).
#
# Exits non-zero if the section is not found.
#
# Usage: section.sh <markdown-file> "<heading-text>"

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $(basename "$0") <markdown-file> \"<heading-text>\"" >&2
  exit 1
fi

DOC="$1"
WANTED="$2"

if [ ! -f "$DOC" ]; then
  echo "Error: file not found: $DOC" >&2
  exit 1
fi

OUTPUT=$(awk -v wanted="$WANTED" '
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

    if (!printing && text == wanted) {
      printing = 1
      start_level = level
      print
      next
    }
  }

  printing { print }
' "$DOC")

if [ -z "$OUTPUT" ]; then
  echo "Error: section '$WANTED' not found in $DOC" >&2
  exit 2
fi

printf '%s\n' "$OUTPUT"
