#!/usr/bin/env bash
# toc.sh — Return a markdown table of contents.
#
# For every heading (#, ##, ###, ...) prints:
#   <heading line>
#     <first non-empty content line under it>
#
# Skips fenced code blocks and table separator rows so the summary lines
# are useful prose/table-headers rather than noise.
#
# Usage: toc.sh <markdown-file>

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $(basename "$0") <markdown-file>" >&2
  exit 1
fi

DOC="$1"

if [ ! -f "$DOC" ]; then
  echo "Error: file not found: $DOC" >&2
  exit 1
fi

awk '
  BEGIN { in_code = 0; heading = ""; summary = "" }

  /^```/ { in_code = !in_code; next }
  in_code { next }

  /^#+[[:space:]]/ {
    if (heading != "") {
      print heading
      if (summary != "") print "  " summary
    }
    heading = $0
    summary = ""
    next
  }

  heading != "" && summary == "" {
    if ($0 ~ /^[[:space:]]*$/) next
    if ($0 ~ /^[[:space:]]*\|[[:space:]]*[-:]/) next
    line = $0
    sub(/^[[:space:]]+/, "", line)
    summary = line
  }

  END {
    if (heading != "") {
      print heading
      if (summary != "") print "  " summary
    }
  }
' "$DOC"
