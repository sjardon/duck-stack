---
name: ds-docs
description: Updates all living documentation after a feature is implemented. Reads analysis.md and design.md to determine what changed, then updates FEATURES.md (status), SPEC.md (module functional state), and conditionally ARCHITECTURE.md, DOMAIN.md, BACKEND.md, and FRONTEND.md. Sets lastStep to "docs". Also handles DOCUMENT_FAILURE to write error.md and mark FEATURES.md as FAILED when implementation retries are exhausted.
---

# Duck-Spec Docs

You update the living documentation after a feature has passed review. You also document failure when the orchestrator exhausts all implementation retries.

You receive an `operation` field that determines which path to execute:

| `operation` | When | Detail file |
|-------------|------|-------------|
| `UPDATE_DOCS` | Default — success path (field may be omitted) | [`update-docs.md`](update-docs.md) |
| `DOCUMENT_FAILURE` | Failure path — retries exhausted | [`document-failure.md`](document-failure.md) |

Read the corresponding detail file and follow its steps exactly. Do not mix steps from the two operations.

## Input

```json
{
  "operation": "UPDATE_DOCS|DOCUMENT_FAILURE",
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "review",
  "pendingFixes": [],
  "retries": 3
}
```

`retries` and `pendingFixes` are only meaningful on the `DOCUMENT_FAILURE` path.

The orchestrator also provides `module` — the module name matching a directory under `duck-spec/modules/`.

## Return value

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "docs",
  "pendingFixes": [],
  "result": {
    "status": "success|failure",
    "updatedFiles": [
      "duck-spec/modules/<module>/FEATURES.md",
      "duck-spec/modules/<module>/SPEC.md"
    ],
    "error": null
  }
}
```

`updatedFiles` lists every file that was actually modified.

On the `DOCUMENT_FAILURE` path, `result.status` is always `"failure"` and `updatedFiles` contains only `error.md` and `FEATURES.md`.

## Rules

- Never modify analysis.md, design.md, or tasks.md.
- Never mark `Estado` as `DONE` if there are unresolved `pendingFixes` — check that `pendingFixes` is empty before updating FEATURES.md.
- On `DOCUMENT_FAILURE`: never touch SPEC.md or any global doc — only write `error.md` and update FEATURES.md.
- Never remove existing valid content from SPEC.md or any global doc.
- Write in present tense in SPEC.md — describe what the system does, not what was added.
- Only update global docs when there is a direct, traceable reason from design.md.
- Write decisions and conventions only. Omit anything derivable from the source tree (file contents, config values, code structure that can be read with `grep` or `Read`).
- No ASCII diagrams. Use tables instead.
- No code snippets unless they define a cross-module contract not encapsulated in a single source file.
