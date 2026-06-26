---
name: ds-context
description: Internal protocol skill — preloaded by duck-spec agents that consult large project documents. Provides bash helpers (toc, section, feature) that return scoped views instead of forcing full-file reads. Not for direct user invocation.
---

# Duck-Spec Context Access

This skill is **preloaded** into agents whose work requires consulting large project documents. It defines the protocol those agents MUST follow when accessing those files.

It is **not invoked directly** — the user never types `/ds-context`.

## Why this exists

Reading large reference docs in full inflates each subagent's context window. Most tasks need one or two sections, not the whole file. These helpers return only the scope that is asked for.

## Vetted paths — NEVER use Read on these

The Read tool MUST NOT be used on any of these files. Always go through the helper indicated:

| Path | Helper |
|---|---|
| `duck-spec/docs/BACKEND.md` | `toc.sh` then `section.sh` |
| `duck-spec/docs/FRONTEND.md` | `toc.sh` then `section.sh` |
| `duck-spec/docs/ARCHITECTURE.md` | `toc.sh` then `section.sh` |
| `duck-spec/docs/DOMAIN.md` | `toc.sh` then `section.sh` |
| `duck-spec/docs/INFRASTRUCTURE.md` | `toc.sh` then `section.sh` |
| `duck-spec/docs/SPEC.md` | `toc.sh` then `section.sh` |
| `duck-spec/modules/*/SPEC.md` | `toc.sh` then `section.sh` |
| `duck-spec/modules/*/FEATURES.md` | `feature.sh` |

Feature artifacts (`analysis.md`, `design.md`, `tasks.md` under `duck-spec/modules/<module>/<feature-dir>/`) are short and topic-specific — always read them in full with the Read tool. Do NOT route them through these helpers.

## Scripts

All scripts live under `.claude/skills/ds-context/scripts/` and are invoked via the Bash tool.

### `toc.sh <markdown-file>`

Returns a table of contents: every heading plus the first non-empty content line under it.

```bash
bash .claude/skills/ds-context/scripts/toc.sh duck-spec/docs/BACKEND.md
```

Use this first whenever you need to consult a vetted doc, to decide which sections actually apply.

### `section.sh <markdown-file> "<heading-text>"`

Returns a single section: the heading and everything until the next heading at the same or higher level (nested subsections are included).

```bash
bash .claude/skills/ds-context/scripts/section.sh duck-spec/docs/BACKEND.md "Coding conventions"
```

`<heading-text>` must match the heading exactly (excluding the leading `#`s and surrounding whitespace — copy it verbatim from `toc.sh` output). Non-zero exit if the section is not found.

### `feature.sh <module> <featureId>`

Returns a single feature entry from `duck-spec/modules/<module>/FEATURES.md`.

```bash
bash .claude/skills/ds-context/scripts/feature.sh subscriptions SUBS-003
```

Non-zero exit if the feature is not found.

### `symbols.sh <typescript-file>`

Returns exported declarations from a TypeScript file with bodies stripped — useful for mapping a file before deciding what to read in detail.

```bash
bash .claude/skills/ds-context/scripts/symbols.sh apps/services/src/shared/errors.ts
```

Source files under `apps/` and `packages/` are NOT vetted paths — Read is allowed on them. `symbols.sh` is an optional helper for situations where you only need to know what a file exports (e.g., locating a function to modify, checking type signatures). Prefer it over Read when you do not yet need bodies.

## Usage discipline

1. **Always start with `toc.sh`** when consulting a vetted doc — never go straight to `section.sh` unless you already know the exact heading from prior context.
2. **Pull only sections that demonstrably apply to the task.** Vague applicability ("might be useful") is not a reason to read.
3. **Do NOT fall back to Read on the full doc** if `toc.sh` shows no relevant section — that defeats the purpose. Report the gap to the orchestrator instead.
4. **Never bypass the vetted-paths table.** The Read tool on those paths is prohibited even if it seems faster.
