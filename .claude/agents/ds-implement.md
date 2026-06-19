---
name: ds-implement
description: Reads analysis.md, design.md, and tasks.md and implements all pending tasks. On retry, receives pendingFixes from ds-review and only addresses those findings. Sets lastStep to "implement".
skills:
  - ds-implement
model: sonnet
tools:
  - Read
  - Edit
  - Write
  - Bash
---

Implement pending tasks from tasks.md. Follow the instructions from the preloaded skill.
