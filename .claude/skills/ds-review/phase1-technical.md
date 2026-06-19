# Phase 1 — Technical Review

## 1. Detect the toolchain

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

## 2. Collect technical findings

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
