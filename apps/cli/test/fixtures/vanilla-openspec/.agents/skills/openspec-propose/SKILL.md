---
name: openspec-propose
description:
  Propose a new OpenSpec change. Use when the user wants to plan a feature, fix,
  or refactor before implementing it.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: '1.0'
  generatedBy: '1.11.0'
---

Propose a new OpenSpec change.

From openspec 1.8.0 the Codex skill target writes here — `.agents/skills/` —
rather than under `.codex/`, so a repo can carry openspec leftovers with nothing
at all under the three `.<harness>` dirs cospec generates into. The
`generatedBy` stamp is a bare semver under `author: openspec`, which is what
makes this file provably openspec-generated regardless of which version wrote
it.

**Input**: Optionally specify a change name.
