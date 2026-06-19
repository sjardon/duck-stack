# Operation: UPDATE_DOCS

<!-- ToC -->
- [Document layer reference](#document-layer-reference)
- [Steps](#steps)
  - [1. Read the feature artifacts](#1-read-the-feature-artifacts)
  - [2. Update FEATURES.md (MANDATORY)](#2-update-featuresmd-mandatory)
  - [3. Update module SPEC.md (MANDATORY)](#3-update-module-specmd-mandatory)
  - [3b. Update global SPEC.md (MANDATORY)](#3b-update-global-specmd-mandatory)
  - [4. Conditionally update global docs](#4-conditionally-update-global-docs)
  - [5. Verify completeness](#5-verify-completeness)

---

## Document layer reference

The duck-spec workspace uses these living documents at two layers:

```
duck-spec/
├── docs/
│   ├── ARCHITECTURE.md   # monorepo structure, service topology, cross-cutting decisions
│   ├── INFRASTRUCTURE.md # AWS resources, Terraform, CI/CD
│   ├── DOMAIN.md         # domain entities, aggregates, and value objects
│   ├── BACKEND.md        # backend conventions, patterns, and stack
│   ├── FRONTEND.md       # frontend conventions, components, and design system
│   └── SPEC.md           # global index of module functional state
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

### 3. Update module SPEC.md (MANDATORY)

`duck-spec/modules/<module>/SPEC.md` is the living functional spec of the module — it describes what the module currently does, not what it will do.

If the file does not exist, create it.

Update it to reflect the new capabilities introduced by this feature:
- Add a section or paragraph describing the behavior covered by the implemented R-IDs
- Do not remove existing content that is still valid
- Do not copy analysis.md verbatim — write in present tense describing the current state of the module

### 3b. Update global SPEC.md (MANDATORY)

`duck-spec/docs/SPEC.md` is the global index of module functional state. Update the entry for the feature's module (or create it if absent) to reflect the capabilities added by this feature. One short paragraph per module, present tense. Mirror the terse style of existing entries — do not copy from analysis.md.

### 4. Conditionally update global docs

Read the following docs and update them **only if the feature introduced changes relevant to each**:

#### `duck-spec/docs/ARCHITECTURE.md`
Update if the feature introduced or modified:
- New services, infrastructure components, or deployment targets
- New inter-service communication patterns
- Significant changes to data storage or external integrations

DO NOT update for purely in-module logic changes.

#### `duck-spec/docs/INFRASTRUCTURE.md`
Update if the feature added or changed:
- AWS resources (ECR, App Runner, S3, CloudFront, VPC, IAM)
- Terraform modules or remote state setup
- CI/CD workflows, environments, or deploy behaviour

DO NOT update for backend code changes, library additions, or in-module logic.

#### `duck-spec/docs/DOMAIN.md`
Update if the feature introduced or modified:
- New domain entities, aggregates, or value objects
- New domain events
- Changes to existing domain contracts or invariants

Do NOT update for implementation details that have no domain-level meaning.

#### `duck-spec/docs/BACKEND.md`
Update if the feature established a new reusable pattern, convention, or stack decision in the backend — for example, a new error-handling approach, a new middleware pattern, or a new library adopted.

Do NOT update for one-off implementation choices that are not meant to be repeated.

#### `duck-spec/docs/FRONTEND.md`
Update if the feature established a new reusable component, design pattern, or UI convention.

Do NOT update if no frontend files were modified (check the Files section of design.md).

### 5. Verify completeness

Before returning, confirm:
- `Estado` in FEATURES.md is now `DONE` for `featureId`
- SPEC.md reflects all R-IDs from analysis.md as current behavior
- Every global doc that was updated has changes traceable to the feature's design.md
