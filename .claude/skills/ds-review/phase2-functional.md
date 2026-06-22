# Phase 2 — Functional Review

Run this phase regardless of Phase 1 outcome.

## 1. Read the artifacts

Read all three files:
- `duck-spec/modules/<module>/<feature-dir>/analysis.md` — source of truth for what the feature must do
- `duck-spec/modules/<module>/<feature-dir>/design.md` — requirement coverage table maps R-IDs to design decisions
- `duck-spec/modules/<module>/<feature-dir>/tasks.md` — lists which T-IDs cover which R-IDs

## 2. Read the implementation

Read every file listed under `Files` in design.md. These are the only files in scope for functional verification.

## 2.5 Verify acceptance test coverage

For each R-ID in analysis.md, check that an acceptance test exists in the `tests/` directory of the relevant app referencing that R-ID (by name in the describe/it block or a comment).

- If a test exists: confirm it passed in Phase 1 results. If it failed, Phase 1 already captured it — skip duplicate.
- If no test exists for an R-ID: produce a finding:
  ```json
  { "type": "review", "severity": "error", "rId": "R001", "file": null, "line": null, "detail": "No acceptance test found for R001" }
  ```

Continue with Step 3 for all R-IDs regardless of test presence.

## 3. Verify each requirement

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

## 4. Collect functional findings

For each unmet requirement, produce one finding entry:

```json
{
  "type": "review",
  "severity": "error",
  "rId": "R003",
  "file": "src/auth/login.ts",
  "line": null,
  "detail": "WHEN login fails the system shall return a 401 response — implementation returns 500 on invalid credentials"
}
```

- `rId` must contain the exact R-ID or NF-ID that is not satisfied — never embed it in `detail`
- `file` should point to the most relevant implementation file; use `null` if the behavior is entirely absent
- Functional gaps are always `severity: "error"`
