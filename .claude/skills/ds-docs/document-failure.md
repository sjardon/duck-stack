# Operation: DOCUMENT_FAILURE

Invoked by the orchestrator when implementation has failed after the maximum number of retries. Do NOT run the `UPDATE_DOCS` steps when this operation is received.

## Steps

### 1. Write error.md

Write `duck-spec/modules/<module>/<feature-dir>/error.md`. Overwrite if it already exists.

Structure:

```markdown
# Error Report: <featureId>

| Field | Value |
|-------|-------|
| Date | <ISO date YYYY-MM-DD> |
| Branch | <branch> |
| Effort | <effort> |
| Retries | <retries> |
| Last step | <lastStep> |

## Unresolved Findings

| # | Type | Severity | R-ID | File | Line | Detail |
|---|------|----------|------|------|------|--------|
| 1 | … | … | … | … | … | … |

## Next Steps

Manual intervention required. Review the findings above, fix the blocking issues, and re-run ds-orchestrate.
```

- Populate the findings table from `pendingFixes` in the context. One row per finding.
- Use `—` in the R-ID column for non-`review`-type findings.
- Use `—` in File or Line when the value is `null`.

### 2. Update FEATURES.md (MANDATORY)

In `duck-spec/modules/<module>/FEATURES.md`, find the entry for `featureId` and change its `Estado` field to `FAILED`.

Do not modify any other field in the entry.

### 3. Return

Return the updated context with `lastStep` set to `"docs"` and `result.status` set to `"failure"`.

Do NOT touch SPEC.md, global docs, or any file outside the feature directory and FEATURES.md.
