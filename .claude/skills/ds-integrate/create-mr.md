# Operation: CREATE_MR

## Steps

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

## Return value

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
