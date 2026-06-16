---
name: ds-docs
description: Updates all living documentation after a feature is implemented. Reads analysis.md and design.md to determine what changed, then updates FEATURES.md (status), SPEC.md (module functional state), and conditionally ARCHITECTURE.md, DOMAIN.md, BACKEND.md, and FRONTEND.md. Sets lastStep to "docs".
---

# Duck-Spec Docs

You update the living documentation after a feature has passed review. You read what was built and update only the documents that are actually affected.

## Input

```json
{
  "featureId": "AUTH-001",
  "branch": "feature/auth-001-short-desc",
  "effort": "low|medium|high",
  "lastStep": "review",
  "pendingFixes": []
}
```

The orchestrator also provides `module` — the module name matching a directory under `duck-spec/modules/`.

---

## Document layer reference

The duck-spec workspace uses these living documents at two layers:

```
duck-spec/
├── ARCHITECTURE.md   # infrastructure, services, deployment decisions
├── DOMAIN.md         # index of all domain entities, aggregates, and value objects
├── BACKEND.md        # backend conventions, patterns, and stack
├── FRONTEND.md       # frontend conventions, components, and design system
│
└── modules/
    └── <module>/
        ├── FEATURES.md   # feature registry — Estado field must be updated
        └── SPEC.md       # living spec of the module's current functional state
```

---

## Steps

### 1. Read the feature artifacts

Read these files before modifying anything:
- `duck-spec/modules/<module>/<feature-dir>/analysis.md` — requirements, scope, NFRs
- `duck-spec/modules/<module>/<feature-dir>/design.md` — chosen solution, technical design, files modified

### 2. Update FEATURES.md (MANDATORY)

In `duck-spec/modules/<module>/FEATURES.md`, find the entry for `featureId` and change its `Estado` field to `DONE`.

Do not modify any other field in the entry.

### 3. Update SPEC.md (MANDATORY)

`duck-spec/modules/<module>/SPEC.md` is the living functional spec of the module — it describes what the module currently does, not what it will do.

If the file does not exist, create it.

Update it to reflect the new capabilities introduced by this feature:
- Add a section or paragraph describing the behavior covered by the implemented R-IDs
- Do not remove existing content that is still valid
- Do not copy analysis.md verbatim — write in present tense describing the current state of the module

### 4. Conditionally update global docs

Read the following docs and update them **only if the feature introduced changes relevant to each**:

#### ARCHITECTURE.md
Update if the feature introduced or modified:
- New services, infrastructure components, or deployment targets
- New inter-service communication patterns
- Significant changes to data storage or external integrations

Do NOT update for purely in-module logic changes.

#### DOMAIN.md
Update if the feature introduced or modified:
- New domain entities, aggregates, or value objects
- New domain events
- Changes to existing domain contracts or invariants

Do NOT update for implementation details that have no domain-level meaning.

#### BACKEND.md
Update if the feature established a new reusable pattern, convention, or stack decision in the backend — for example, a new error-handling approach, a new middleware pattern, or a new library adopted.

Do NOT update for one-off implementation choices that are not meant to be repeated.

#### FRONTEND.md
Update if the feature established a new reusable component, design pattern, or UI convention.

Do NOT update if no frontend files were modified (check the Files section of design.md).

### 5. Verify completeness

Before returning, confirm:
- `Estado` in FEATURES.md is now `DONE` for `featureId`
- SPEC.md reflects all R-IDs from analysis.md as current behavior
- Every global doc that was updated has changes traceable to the feature's design.md

---

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

---

## Rules

- Never modify analysis.md, design.md, or tasks.md.
- Never mark `Estado` as `DONE` if there are unresolved `pendingFixes` — check that `pendingFixes` is empty before updating FEATURES.md.
- Never remove existing valid content from SPEC.md or any global doc.
- Write in present tense in SPEC.md — describe what the system does, not what was added.
- Only update global docs when there is a direct, traceable reason from design.md.
