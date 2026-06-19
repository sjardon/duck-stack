# <featureId> — <feature title>

## Problem statement

<2-3 lines restating the core problem from analysis.md "Reason for being".>

## Alternatives

<!-- Include this section ONLY when effort is "high". Omit entirely for low and medium effort. -->

| Alternative | Description | Decision |
|---|---|---|
| Option A | <one-sentence description> | Not chosen — <reason> |
| Option B | <one-sentence description> | Not chosen — <reason> |
| Option C | <one-sentence description> | **Chosen** — <reason> |

## Chosen solution

**<Solution name>**

<Justification: why this solution was selected. Reference the R-IDs it satisfies best and any constraints it respects.>

## Technical design

<Data models, interfaces, contracts, API endpoints, state/data flow. Only include what is necessary to implement the chosen solution.>

<!-- Include the diagram below only when a visual representation clarifies the design (e.g. multi-component flows, state machines, call sequences). Omit if the prose above is sufficient. -->

```mermaid
<!-- Replace with the appropriate diagram type:
  - flowchart LR   for data/control flow
  - sequenceDiagram for call sequences between components
  - stateDiagram-v2 for state machines
  - erDiagram for data models
-->
```

## Files

| Path | Action | Description |
|---|---|---|
| `src/module/file.ts` | CREATE | <what this file contains> |
| `src/module/other.ts` | MODIFY | <what changes in this file> |

## Requirement coverage

| ID | Design decision |
|---|---|
| R001 | <which part of the design satisfies this requirement> |
| R002 | <which part of the design satisfies this requirement> |
| NF001 | <which part of the design satisfies this requirement> |
