# Operation: CREATE_MR

## Steps

1. Read `duck-spec/modules/<module>/<feature-dir>/analysis.md` to extract:
   - Feature title (first heading or the **Objetivo** field)
   - A short summary of the functional requirements for the PR body

2. Read `duck-spec/modules/<module>/<feature-dir>/design.md` and scan the **Files** table to derive the affected components diagram:
   - Group modified/created files by their top-level app or package (e.g. `apps/web`, `apps/services`, `packages/types`, `apps/services/supabase`).
   - Identify the external systems each component interacts with (e.g. Supabase DB, a PaymentProvider, an external API).
   - Build a `graph TD` Mermaid diagram where each node is a component (app, package, or external system) and each edge represents a dependency or data-flow direction inferred from the design. Use shape conventions:
     - Rounded box `(label)` for app or package nodes.
     - Cylinder `[(label)]` for databases.
     - Hexagon `{{label}}` for external provider/API nodes.
   - Label edges with the key operation or artifact exchanged (e.g. `REST`, `shared types`, `SQL`, `createCheckout`).

3. Open the MR:
   ```
   gh pr create \
     --title "<featureId> — <feature title>" \
     --body "$(cat <<'EOF'
   ## Summary
   <2-3 bullet points from the functional requirements in analysis.md>

   ## Affected components

   ```mermaid
   graph TD
     <generated component diagram>
   ```

   ## Feature
   `<featureId>`

   ## Test plan
   - [ ] Unit tests passing
   - [ ] Functional requirements verified against analysis.md
   EOF
   )"
   ```

4. Capture the PR URL returned by `gh pr create` and include it in the return value.

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
