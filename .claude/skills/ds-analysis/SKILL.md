---
name: ds-analysis
description: Takes a feature from FEATURES.md and produces analysis.md with EARS requirements (R-IDs), out-of-scope, and edge cases. Sets the effort field in the shared context.
---

# Duck-Spec Analysis

You produce the functional analysis for a feature. Read `analysis.template.md` in this skill's directory to understand the exact output format before starting.

## Input

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": null,
  "lastStep": "branch",
  "pendingFixes": []
}
```

The orchestrator also provides `module` — the module name matching a directory under `duck-spec/modules/`.

## Steps

### 1. Validate the feature

Read `duck-spec/modules/<module>/FEATURES.md` and locate the entry for `featureId`.

If `Estado` is `DONE` or `DEPRECATED`: return `status: "failure"` with a descriptive error. Do NOT proceed.

### 2. Read referenced documentation

Read every file or link listed in the feature's `Documentación relevante` field before writing anything. This context informs the quality of the requirements.

### 3. Produce analysis.md

Using the template in `analysis.template.md`, fill in each section by mapping FEATURES.md fields as follows:

| Section in analysis.md | Source in FEATURES.md |
|---|---|
| Reason for being | `Contexto` + `Objetivo` |
| Scope | Summarize what the requirements cover |
| Out of scope | `Fuera de scope` |
| Functional requirements | `Requerimientos funcionales` → convert each bullet to an EARS statement with a unique ID (R001, R002…) |
| Non-functional requirements | `Requerimientos no funcionales` → each item gets a unique ID (NF001, NF002…) |
| Edge cases | `Edge cases` → each item gets a unique ID (EC001, EC002…) |
| Technical constraints | `Technical constraints` (omit section if field is absent) |

**EARS conversion rules:**
- User-visible behavior triggered by an event → `WHEN <trigger> the system shall <response>`
- Persistent system behavior → `The system shall <response>`
- Conditional behavior → `IF <condition>, THEN the system shall <response>`
- State-dependent → `WHILE <state> the system shall <response>`
- Keep each statement atomic — one observable behavior per row.

**ID rules:**
- IDs are sequential and zero-padded: R001, R002…, NF001…, EC001…
- IDs must never be reused within the same analysis.md
- IDs are the traceability keys used by tasks.md and ds-review

Write the output to: `duck-spec/modules/<module>/<feature-dir>/analysis.md`

The `<feature-dir>` is a kebab-case slug derived from the feature title (e.g., `AUTH-001 — Login flow` → `auth-001-login-flow`).

### 4. Calculate effort

Determine effort based on the total analysis content:

| Level | Criteria |
|---|---|
| `low` | ≤3 functional requirements, no NFRs, no edge cases, no dependencies |
| `medium` | 4–7 requirements, or NFRs present, or edge cases present, or simple dependencies |
| `high` | >7 requirements, or critical security/performance NFRs, or multiple dependencies |

## Return value

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "analysis",
  "pendingFixes": [],
  "result": {
    "status": "success|failure",
    "analysisFile": "duck-spec/modules/<module>/<feature-dir>/analysis.md",
    "error": null
  }
}
```

## Rules

- Never modify FEATURES.md.
- Never skip the documentation reading step — it affects requirement quality.
- Never invent requirements not traceable to FEATURES.md.
- Requirement IDs are immutable once written — ds-review and tasks.md will reference them.
