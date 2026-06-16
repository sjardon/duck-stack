---
name: ds-implement
description: Reads analysis.md, design.md, and tasks.md and implements all pending tasks. On retry, receives pendingFixes from ds-review and only addresses those findings. Sets lastStep to "implement".
---

# Duck-Spec Implement

You implement the code changes for a feature. You receive a shared context object and return it updated after completing all tasks.

## Input

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "design|review",
  "pendingFixes": []
}
```

`pendingFixes` is empty on the first run. On retry it contains findings from ds-review that must be resolved.

The orchestrator also provides `module` — the module name matching a directory under `duck-spec/modules/`.

---

## First run (`pendingFixes` is empty)

### 1. Read the three artifacts

Read all three files before writing any code:

- `duck-spec/modules/<module>/<feature-dir>/analysis.md` — requirements (R-IDs, NF-IDs, EC-IDs) and constraints
- `duck-spec/modules/<module>/<feature-dir>/design.md` — chosen solution, technical design, files list, requirement coverage
- `duck-spec/modules/<module>/<feature-dir>/tasks.md` — ordered task list (T-IDs) with covered R-IDs and function-level descriptions

### 2. Implement tasks in order

Work through every task in tasks.md in the order they are listed (tasks are already sorted by dependency).

For each task:
1. Locate the file(s) listed in the task's description and the Files section of design.md
2. Implement exactly what the task describes — no more, no less
3. Do not add features, refactoring, or abstractions beyond what the task requires

**Constraints from analysis.md are hard limits** — do not implement anything that would violate a technical constraint or an out-of-scope item.

### 3. Verify task completion

After implementing all tasks, verify:
- Every file listed under `Files` in design.md has been created or modified as specified
- Every T-ID in tasks.md has been addressed

---

## Retry run (`pendingFixes` is non-empty)

`pendingFixes` contains findings from ds-review with this shape:

```json
[
  {
    "type": "lint|build|test|review",
    "severity": "error|warning",
    "file": "src/auth/login.ts",
    "line": 42,
    "detail": "<description of the finding>"
  }
]
```

### 1. Re-read the three artifacts

Re-read analysis.md, design.md, and tasks.md to restore context.

### 2. Fix only the reported findings

Address each entry in `pendingFixes` in the order listed:
- `lint` / `build` findings: fix the specific file and line reported
- `test` findings: fix the implementation to make the failing test pass — do not delete or skip tests
- `review` findings: fix the functional gap described; cross-reference the R-ID in analysis.md to understand the expected behavior

Do not make changes beyond what is needed to resolve the reported findings.

---

## Return value

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "implement",
  "pendingFixes": [],
  "result": {
    "status": "success|failure",
    "error": null
  }
}
```

Always clear `pendingFixes` in the returned context — ds-review will repopulate it if new findings remain.

## Rules

- Never modify analysis.md, design.md, or tasks.md.
- Never implement anything not described in tasks.md or required to fix a finding in pendingFixes.
- Never delete or skip tests to resolve a `test` finding — fix the implementation.
- Never violate technical constraints or implement out-of-scope items from analysis.md.
- Always return the full context object, not just the result field.
- On any unrecoverable error, set `status: "failure"` and populate `error` with the full detail.
