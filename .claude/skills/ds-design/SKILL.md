---
name: ds-design
description: Takes analysis.md for a feature and produces design.md (alternatives when effort is high, chosen solution, technical design, files to modify) and tasks.md (function-level task list referencing R-IDs). Sets lastStep to "design". Use when the orchestrator (ds-orchestrate) has completed ds-analysis and lastStep is "analysis".
---

# Duck-Spec Design

You produce the technical design and task breakdown for a feature. Read `design.template.md` and `tasks.template.md` in this skill's directory to understand the exact output format before starting.

## Input

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "analysis",
  "pendingFixes": []
}
```

The orchestrator also provides `module` — the module name matching a directory under `duck-spec/modules/`.

## Steps

### 1. Read analysis.md

Read `duck-spec/modules/<module>/<feature-dir>/analysis.md` in full.

Extract:
- All functional requirement IDs and statements (R001, R002…)
- All non-functional requirement IDs (NF001…)
- All edge case IDs (EC001…)
- Technical constraints (if present)
- Out of scope items

The `<feature-dir>` is the kebab-case slug already created during ds-analysis (e.g., `AUTH-001 — Login flow` → `auth-001-login-flow`).

Do NOT proceed until the file is read and all IDs are catalogued.

### 2. Evaluate solution alternatives

The number of alternatives to evaluate depends on `effort`:

| Effort | Alternatives |
|---|---|
| `low` or `medium` | 1 — go directly to the best solution |
| `high` | 3 — evaluate three distinct approaches, then choose one |

For each alternative (when evaluating more than one), determine:
- A short name
- A one-sentence description of the approach
- Why it was not chosen (or mark it as chosen)

Select the solution that best satisfies:
1. All functional requirements (R-IDs)
2. Non-functional requirements (NF-IDs), especially security and performance constraints
3. Technical constraints from analysis.md
4. Minimizes scope creep beyond what's in analysis.md

### 3. Produce design.md

Using the template in `design.template.md`, fill in each section:

| Section | Content |
|---|---|
| Problem statement | 2-3 lines restating the core problem from analysis.md "Reason for being" |
| Alternatives | Only present when `effort` is `high`: one row per alternative (name, one-sentence description, reason not chosen or "chosen"). Omit this section entirely for `low` and `medium` effort. |
| Chosen solution | Name of selected solution + justification referencing which R-IDs it satisfies best |
| Technical design | Data models, interfaces, contracts, API endpoints, state/data flow — only what is needed to implement the chosen solution |
| Files | Precise list of files to create, modify, or delete — ds-implement reads this directly |
| Requirement coverage | Mapping table: each R-ID and NF-ID → the design decision that satisfies it |

**Rules for the Files section:**
- Use absolute paths relative to the repo root (e.g., `src/auth/login.ts`)
- Mark each entry as `CREATE`, `MODIFY`, or `DELETE`
- Include every file that must change — ds-implement uses this list as its work scope

**Rules for Requirement coverage:**
- Every R-ID from analysis.md must appear in this table
- NF-IDs should appear if the design has a specific decision that addresses them
- EC-IDs that require a specific design decision should appear; otherwise omit them

Write the output to: `duck-spec/modules/<module>/<feature-dir>/design.md`

### 4. Produce tasks.md

Using the template in `tasks.template.md`, create one task per atomic, function-level unit of work.

**Task granularity rule:** one task per atomic function-level unit of work.

**Required task schema — every task must specify:**
- `id`: T001, T002… (sequential, zero-padded)
- `type`: `test` | `implement` | `refactor`
- `file`: exact file path matching an entry in design.md Files section
- `symbol`: the specific function, class, method, or export being created or modified
- `action`: one sentence — exactly what to do in that symbol
- `covers`: list of R-IDs and NF-IDs this task satisfies

**ATDD ordering rule:** for each R-ID, generate tasks in this sequence:
1. `test` task — write the acceptance test for the R-ID (test file in `tests/` of the relevant app)
2. `implement` task — implement the production code
3. `refactor` task (optional) — only when the design calls for a non-trivial cleanup step

Tasks must also be ordered by dependency: if T002 depends on T001, T002 comes after it.

**Coverage rules:**
- Every R-ID from analysis.md must be covered by at least one task
- A task may cover multiple IDs; an ID may be covered by multiple tasks
- No task references an ID not in analysis.md

Write the output to: `duck-spec/modules/<module>/<feature-dir>/tasks.md`

### 5. Verify coverage

Before returning, verify:
- Every R-ID from analysis.md appears in the `Covers` column of at least one task in tasks.md
- Every file listed in the Files section of design.md is targeted by at least one task in tasks.md
- No task references an ID that does not exist in analysis.md

If any check fails, fix the gap before returning.

## Return value

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "design",
  "pendingFixes": [],
  "result": {
    "status": "success|failure",
    "designFile": "duck-spec/modules/<module>/<feature-dir>/design.md",
    "tasksFile": "duck-spec/modules/<module>/<feature-dir>/tasks.md",
    "error": null
  }
}
```

## Rules

- Never modify analysis.md or FEATURES.md.
- Never invent requirements not present in analysis.md — design only covers what is in scope.
- Technical constraints in analysis.md are hard constraints — the chosen solution must respect them.
- Out of scope items in analysis.md must not appear as tasks or design decisions.
- Every R-ID must be traceable from analysis.md → design.md (requirement coverage table) → tasks.md (covers field).
