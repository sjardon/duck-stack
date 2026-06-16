---
name: ds-integrate
description: Handles git and GitHub integration for the duck-spec workflow. Supports CREATE_BRANCH (creates the feature branch and sets the branch field in the shared context) and CREATE_MR (opens a GitHub MR with all feature changes).
---

# Duck-Spec Integrate

You handle git and GitHub integration. You receive a shared context object with an `operation` field and return the updated context.

## Input

```json
{
  "operation": "CREATE_BRANCH|CREATE_MR",
  "featureId": "AUTH-001",
  "branch": null,
  "effort": "low|medium|high",
  "lastStep": null,
  "pendingFixes": []
}
```

---

## Operation: CREATE_BRANCH

### Steps

1. Sync with main:
   ```
   git fetch --all
   git checkout master
   git pull origin master
   ```

2. Derive the branch name from `featureId`:
   - Lowercase the ID and replace special characters with hyphens
   - Read `duck-spec/modules/<module>/FEATURES.md` to extract a 2–4 word slug from the feature title
   - Format: `feature/<feature-id-lowercase>-<short-slug>` (e.g. `feature/auth-001-login-flow`)

3. Check the branch does not already exist:
   ```
   git branch --list <branch>
   ```
   If it exists, return `status: "failure"` with a descriptive error.

4. Create and switch to the branch:
   ```
   git checkout -b <branch>
   ```

5. Confirm you are on the new branch before returning.

### Return value

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-login-flow",
  "effort": null,
  "lastStep": "branch",
  "pendingFixes": [],
  "result": {
    "operation": "CREATE_BRANCH",
    "status": "success|failure",
    "error": null
  }
}
```

---

## Operation: CREATE_MR

### Steps

1. Read `duck-spec/modules/<module>/<feature-dir>/analysis.md` to extract:
   - Feature title (first heading or the **Objetivo** field)
   - A short summary of the functional requirements for the PR body

2. Open the MR:
   ```
   gh pr create \
     --title "<featureId> — <feature title>" \
     --body "$(cat <<'EOF'
   ## Summary
   <2-3 bullet points from the functional requirements in analysis.md>

   ## Feature
   `<featureId>`

   ## Test plan
   - [ ] Unit tests passing
   - [ ] Functional requirements verified against analysis.md
   EOF
   )"
   ```

3. Capture the PR URL returned by `gh pr create`.

### Return value

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-login-flow",
  "effort": "medium",
  "lastStep": "integrate",
  "pendingFixes": [],
  "result": {
    "operation": "CREATE_MR",
    "status": "success|failure",
    "url": "https://github.com/<org>/<repo>/pull/<number>",
    "error": null
  }
}
```

---

## Rules

- Never push commits or modify files — integration only.
- Always return the full context object, not just the `result` field.
- On any shell error, set `status: "failure"` and populate `error` with the full output.
