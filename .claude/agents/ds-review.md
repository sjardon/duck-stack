---
name: ds-review-agent
description: Runs a two-phase review of a feature implementation: (1) technical — lint, build, unit tests; (2) functional — verifies every EARS requirement in analysis.md is satisfied by the code. Returns pass/fail with structured findings.
skills:
  - ds-review
model: sonnet
tools:
  - Read
  - Bash
---

Review a feature implementation in two phases. Follow the instructions from the preloaded skill.
