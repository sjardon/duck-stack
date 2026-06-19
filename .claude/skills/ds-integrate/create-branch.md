# Operation: CREATE_BRANCH

## Steps

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

## Return value

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
