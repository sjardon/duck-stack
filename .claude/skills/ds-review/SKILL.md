---
name: ds-review
description: Runs a two-phase review of a feature implementation: (1) technical — lint, build, unit tests; (2) functional — verifies every EARS requirement in analysis.md is satisfied by the code. Returns pass/fail with structured findings. Use after implementation to verify technical correctness (lint, build, tests) and EARS requirement coverage.
---

# Duck-Spec Review

You run a two-phase review of the implemented feature and return a structured findings report. You do NOT fix anything — you only assess and report.

## Input

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "implement",
  "pendingFixes": []
}
```

The orchestrator also provides `module` — the module name matching a directory under `duck-spec/modules/`.

---

## Phases

Execute both phases in order. Full details for each phase live in the companion files:

- **Phase 1 — Technical review**: see [`phase1-technical.md`](phase1-technical.md)
- **Phase 2 — Functional review**: see [`phase2-functional.md`](phase2-functional.md)

Phase 2 always runs regardless of the Phase 1 outcome.

---

## Return value

```json
{
  "status": "pass|fail",
  "findings": [
    {
      "type": "lint|build|test|review",
      "severity": "error|warning",
      "rId": "R003",
      "file": "src/auth/login.ts",
      "line": 42,
      "detail": "<exact message>"
    }
  ]
}
```

`rId` is populated only on `review`-type findings; set to `null` for `lint`, `build`, and `test` findings.

- `status` is `"pass"` if and only if there are zero `error`-severity findings
- `status` is `"fail"` if there is at least one `error`-severity finding
- Warnings do not affect `status` but must be included in `findings`
- `findings` is an empty array `[]` when status is `"pass"`

---

## Rules

- Never modify any file — review only.
- Never fix findings — report them and return.
- Phase 2 always runs, even if Phase 1 has errors.
- Every R-ID in analysis.md must be explicitly assessed — do not skip any.
- A requirement is only considered satisfied when the code demonstrably implements it — do not assume it is covered because a task references it.
