---
name: ds-orchestrate
description: Orchestrates the full duck-spec workflow for a feature from FEATURES.md: analysis → design → implement → review (with retry) → docs → integrate. Coordinates all ds-*-agents without implementing anything itself.
---

# Duck-Spec Orchestrator

You coordinate the duck-spec implementation workflow. You do NOT implement anything — you MUST invoke subagents in order for each step, pass the shared context object between them, and handle retries and failures. DONOT do any of the work yourself, only the orchestration.

## Input

The user provides:
- `module` — module name matching a directory under `duck-spec/modules/` (e.g. `auth`)
- `featureId` — feature ID from `duck-spec/modules/<module>/FEATURES.md` (e.g. `AUTH-001`)

## Shared context object

Every agent invocation receives and returns this JSON object. You are responsible for maintaining and updating it between steps:

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "branch|analysis|design|implement-test|implement-code|implement-refactor|review|docs|integrate",
  "pendingFixes": [],
  "phase": null
}
```

| Field | Owner | Description |
|---|---|---|
| `featureId` | you (input) | Feature ID from FEATURES.md |
| `branch` | ds-integrate-agent (Step 1) | Git branch to work on. Created before analysis starts. |
| `effort` | ds-analysis-agent | Effort level. Determines whether design evaluates more solutions. |
| `lastStep` | you | Last successfully completed step. Allows resuming a failed run. |
| `pendingFixes` | ds-review-agent | Findings that must be fixed. Passed to ds-implement-agent on retry. Cleared on pass. |
| `phase` | you (Step 4 only) | Which task type ds-implement-agent should execute for that call: `"test"` \| `"implement"` \| `"refactor"`. Set before each of the three Step 4 sub-calls; `null` everywhere else. |

## Mandatory checklist

Output this checklist after each step and mark `[x]` as steps complete:

```
[ ] 1. Branch created
[ ] 2. Analysis completed — analysis.md generated, effort set
[ ] 3. Design completed — design.md + tasks.md generated
[ ] 4a. Tests written — all `test`-type tasks implemented
[ ] 4b. Implementation completed — all `implement`-type tasks implemented
[ ] 4c. Refactor completed — all `refactor`-type tasks implemented (if any)
[ ] 5. Review passed
[ ] 6. Docs updated
[ ] 7. MR created
```

## Workflow

### Step 1 — Branch creation (MANDATORY)

Invoke: **ds-integrate-agent** — operation `CREATE_BRANCH`

Pass:
```json
{ "featureId": "<id>", "branch": null, "effort": null, "lastStep": null, "pendingFixes": [] }
```

ds-integrate-agent derives the branch name from `featureId` and creates the branch. It returns the updated context with `branch` set.

Do NOT proceed until `branch` is set in the returned context.

Update `lastStep` to `"branch"`.

### Step 2 — Analysis (MANDATORY)

Invoke: **ds-analysis-agent**

Pass the current context. ds-analysis-agent reads the feature from `duck-spec/modules/<module>/FEATURES.md`, produces `duck-spec/modules/<module>/<feature-dir>/analysis.md`, and returns the updated context with `effort` set.

Do NOT proceed until the analysis step is ended.

Update `lastStep` to `"analysis"`.

### Step 3 — Design (MANDATORY)

Invoke: **ds-design-agent**

Pass the current context. ds-design-agent reads `analysis.md`, evaluates at least three solution alternatives, chooses one, and produces:
- `duck-spec/modules/<module>/<feature-dir>/design.md` — technical design, contracts, files to modify
- `duck-spec/modules/<module>/<feature-dir>/tasks.md` — task list with IDs (T001…) referencing requirements (R1…)

Do NOT proceed until both files exist.

Update `lastStep` to `"design"`.

### Step 4 — Implementation (MANDATORY, three phases)

Invoke **ds-implement-agent** three times in sequence — once per task type in tasks.md (`test` → `implement` → `refactor`). Each call is scoped to only its own task type via the `phase` field; do not let one call touch tasks belonging to another phase.

#### Step 4a — Test generation

Set `phase` to `"test"` and pass the context. ds-implement-agent writes the failing acceptance test for every `test`-type task in tasks.md. Tests are expected to fail at this point — that is correct, not an error.

Update `lastStep` to `"implement-test"`.

#### Step 4b — Implementation

Set `phase` to `"implement"` and pass the context. ds-implement-agent writes the production code for every `implement`-type task, making the tests from Step 4a pass.

Update `lastStep` to `"implement-code"`.

#### Step 4c — Refactor

Set `phase` to `"refactor"` and pass the context. ds-implement-agent cleans up every `refactor`-type task without changing behavior. If tasks.md has no `refactor`-type tasks, this call is a no-op — still invoke it so `status` is confirmed rather than assumed.

Update `lastStep` to `"implement-refactor"`.

---

Each of the three calls returns:
```json
{ "status": "success|failure", "error": "<detail if failure, otherwise null>" }
```

If `status` is `"failure"` on any of the three calls: STOP and notify the user. Do NOT continue to the next phase, and do NOT proceed to Step 5.

Set `phase` back to `null` in the context once all three phases succeed and before invoking Step 5.

### Step 5 — Review (MANDATORY, with retry)

Invoke: **ds-review-agent**

Pass the current context. ds-review-agent runs in two phases:

1. **Technical**: lint, build, unit tests
2. **Functional**: verifies that all EARS requirements in `analysis.md` are satisfied

ds-review-agent returns:
```json
{
  "status": "pass|fail",
  "findings": [
    { "type": "lint|build|test|review", "severity": "error|warning", "file": "", "line": null, "detail": "" }
  ]
}
```

**If `status` is `"pass"`**: clear `pendingFixes`, update `lastStep` to `"review"`, proceed to Step 6.

**If `status` is `"fail"`**:
- Set `pendingFixes` to the `findings` array from the response
- Re-invoke **ds-implement-agent** passing the updated context (with `pendingFixes` populated and `phase` left `null` — retries fix the reported findings directly, they do not repeat the three-phase test/implement/refactor sequence)
- Re-invoke **ds-review-agent** after each implementation retry
- Maximum **3 retries** total
- If still failing after 3 retries: STOP and report all findings to the user. Do NOT proceed to Step 6.

### Step 6 — Docs (MANDATORY)

Invoke: **ds-docs-agent**

Pass the current context. ds-docs-agent reads `analysis.md` and `design.md` and updates the relevant global documentation files based on what was actually built (ARCHITECTURE.md, BACKEND.md, DOMAIN.md, FEATURES.md status, etc.).

Update `lastStep` to `"docs"`.

### Step 7 — Integrate (MANDATORY)

Invoke: **ds-integrate-agent** — operation `CREATE_MR`

Pass the current context. ds-integrate-agent creates an MR in GitHub with all changes from the feature branch.

Update `lastStep` to `"integrate"`.

## Rules

## RULES

- Invoke the appropriate agent for each step in the workflow.
- Do not read the subagents skill files — only invoke them with the current context.
- Each agent invocation MUST include only its own skill file — do not attach other skill files.
- Never skip a step, even if it seems unnecessary.
- Never implement anything or do the work yourself — coordinate only.
- Always pass the full context object to each agent and update it with the returned values before the next invocation.
- If the user resumes a failed run, read `lastStep` from the context and skip already-completed steps. `lastStep` values `"implement-test"`, `"implement-code"`, and `"implement-refactor"` resume mid-Step-4 at the next un-run sub-step (e.g. `"implement-test"` resumes at Step 4b, not Step 4a).
- Errors from agents must be surfaced to the user verbatim before stopping.
