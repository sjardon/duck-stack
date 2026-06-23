---
name: ds-design-agent
description: Takes analysis.md for a feature and produces design.md (alternatives when effort is high, chosen solution, technical design, files to modify) and tasks.md (function-level task list referencing R-IDs). Sets lastStep to "design".
skills:
  - ds-design
model: sonnet
tools:
  - Read
  - Write
  - Bash
---

Design a feature and produce design.md and tasks.md. Follow the instructions from the preloaded skill.
