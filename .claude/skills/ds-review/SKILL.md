---
name: ds-review
description: Runs a two-phase review of a feature implementation: (1) technical — lint, build, unit tests; (2) functional — verifies every EARS requirement in analysis.md is satisfied by the code. Returns pass/fail with structured findings.
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

## Phase 1 — Technical review

### 1. Detect the toolchain

Inspect the repo root and the affected files from design.md to determine which commands to run:

| Signal | Commands to run |
|---|---|
| `package.json` with lint script | `npm run lint` (or the script name found) |
| `package.json` with build script | `npm run build` |
| `package.json` with test script | `npm run test` (or `npm test`) |
| `Makefile` with `lint` / `build` / `test` targets | `make lint`, `make build`, `make test` |
| `pyproject.toml` / `setup.py` | `ruff check` or `flake8`, `pytest` |
| No toolchain found | Skip Phase 1 and note it in findings with severity `warning` |

Run lint, build, and test in that order. Stop running further commands in this phase only if build fails (lint and test are independent).

### 2. Collect technical findings

For each failure, produce one finding entry:

```json
{
  "type": "lint|build|test",
  "severity": "error|warning",
  "file": "src/auth/login.ts",
  "line": 42,
  "detail": "<exact error message or test failure output>"
}
```

- Lint warnings → `severity: "warning"`
- Lint errors, build errors, test failures → `severity: "error"`
- `file` and `line` may be `null` if the tool does not report them

---

## Phase 2 — Functional review

Run this phase regardless of Phase 1 outcome.

### 1. Read the artifacts

Read all three files:
- `duck-spec/modules/<module>/<feature-dir>/analysis.md` — source of truth for what the feature must do
- `duck-spec/modules/<module>/<feature-dir>/design.md` — requirement coverage table maps R-IDs to design decisions
- `duck-spec/modules/<module>/<feature-dir>/tasks.md` — lists which T-IDs cover which R-IDs

### 2. Read the implementation

Read every file listed under `Files` in design.md. These are the only files in scope for functional verification.

### 3. Verify each requirement

For every R-ID in analysis.md, verify that the implementation satisfies the EARS statement:

| EARS type | What to verify |
|---|---|
| Event-driven (`WHEN … shall …`) | The trigger is handled and produces the specified response |
| Ubiquitous (`The system shall …`) | The behavior exists unconditionally in the implementation |
| Conditional (`IF … THEN … shall …`) | The condition is checked and the response fires when true |
| State-driven (`WHILE … shall …`) | The behavior is active for the full duration of the state |

Also verify:
- NF-IDs: check that the design decision noted in design.md is actually present in the code
- EC-IDs: check that each edge case is handled — look for guard clauses, error paths, or explicit checks

### 4. Collect functional findings

For each unmet requirement, produce one finding entry:

```json
{
  "type": "review",
  "severity": "error",
  "file": "src/auth/login.ts",
  "line": null,
  "detail": "R003 not satisfied: WHEN login fails the system shall return a 401 response — implementation returns 500 on invalid credentials"
}
```

- Always prefix `detail` with the R-ID or NF-ID that is not satisfied
- `file` should point to the most relevant implementation file; use `null` if the behavior is entirely absent
- Functional gaps are always `severity: "error"`

---

## Return value

```json
{
  "status": "pass|fail",
  "findings": [
    {
      "type": "lint|build|test|review",
      "severity": "error|warning",
      "file": "src/auth/login.ts",
      "line": 42,
      "detail": "<exact message>"
    }
  ]
}
```

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
