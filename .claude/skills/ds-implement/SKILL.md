---
name: ds-implement
description: Reads analysis.md, design.md, and tasks.md and implements all pending tasks. On retry, receives pendingFixes from ds-review and only addresses those findings. Sets lastStep to "implement". Use when design.md and tasks.md exist and code needs to be written, or when pendingFixes from ds-review require resolution.
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

### 2. Reading existing code (discipline)

Use the `Files` section of design.md as your map. For each file you must MODIFY, follow this order:

1. **Prefer mapping over reading.** Use `bash .claude/skills/ds-context/scripts/symbols.sh <file>` (see ds-context skill) to see what the file exports. This alone is often enough to know where to make a change.
2. **Read in a tight window.** When you need a specific symbol's body, use `Grep` to locate it and `Read` with `offset` and `limit` to load only that range.
3. **Read the whole file only when justified.** Reading top-to-bottom is reserved for files under ~100 lines or for structural changes (refactor of imports, large rewrites).

Files marked CREATE do not need to be read — they do not yet exist.

### 3. Implement tasks in order

Work through every task in tasks.md in listed order. Tasks are grouped by R-ID in test→implement→refactor sequence.

For each task:
- `type: test` — write the acceptance test file. Express the EARS statement as a failing case (production code does not exist yet). Do not run the test yet.
- `type: implement` — write the production code that makes the preceding test pass. Implement exactly what the task describes — no more, no less.
- `type: refactor` — clean up the implementation without changing behavior. Only present when ds-design included it.

**Constraints from analysis.md are hard limits** — do not implement anything that would violate a technical constraint or an out-of-scope item.

### 4. Verify task completion

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
    "rId": "R003",
    "file": "src/auth/login.ts",
    "line": 42,
    "detail": "<description of the finding>"
  }
]
```

`rId` is populated only for `review`-type findings. For `lint`, `build`, and `test` findings it is `null`.

### 1. Load only the context required by pendingFixes

Do NOT re-read all three artifacts blindly. Inspect the findings first and load the minimum required:

| Finding type | What to load |
|---|---|
| `lint` / `build` / `test` | The cited `file` only (use `Read` with `offset`/`limit` around the cited `line` if the file is large). Do NOT re-read analysis.md, design.md, or tasks.md. |
| `review` (has `rId`) | Read `analysis.md` and locate the R-ID row in the Functional requirements table. Read `design.md` only if the Requirement-coverage mapping is needed to disambiguate the fix. |
| Mixed | Load the union of the above — never more. |

Never re-read `tasks.md` on retry — tasks are immutable and have already been executed.

### 2. Fix only the reported findings

Address each entry in `pendingFixes` in the order listed:
- `lint` / `build` findings: fix the specific file and line reported
- `test` findings: fix the implementation to make the failing test pass — do not delete or skip tests
- `review` findings: use the `rId` field directly to look up the EARS statement in analysis.md — do not parse the R-ID from `detail`; fix the functional gap so the implementation satisfies that statement

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
    "addressedRIds": ["R003"],
    "error": null
  }
}
```

`addressedRIds` lists the R-IDs fixed during a retry run (empty array on first run). Always clear `pendingFixes` in the returned context — ds-review will repopulate it if new findings remain.

## Rules

- Never modify analysis.md, design.md, or tasks.md.
- Never implement anything not described in tasks.md or required to fix a finding in pendingFixes.
- Never delete or skip tests to resolve a `test` finding — fix the implementation.
- Never violate technical constraints or implement out-of-scope items from analysis.md.
- Always return the full context object, not just the result field.
- On any unrecoverable error, set `status: "failure"` and populate `error` with the full detail.
