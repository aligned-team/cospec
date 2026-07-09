---
name: cospec-sync-specs
description: Explain how spec sync works (it runs inside archive) and preview what would merge.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.3.0
  contentHash: sha256:f98ef0f77e240555f9e49b2ad181fe2732fd32e1bb3089a66ec0a254a65f02a7
---

Explain and preview spec synchronization. Spec sync is not a standalone step in
cospec.

Delta specs in a change are merged into the living specs under `openspec/specs/`
**only** by `cospec archive`, which applies the merge and then verifies it as
one coupled operation. There is no supported mid-flight "sync now without
archiving" path. This is deliberate: a partial merge would leave a tree that
neither validates nor archives cleanly.

## Preview what would merge

```
cospec validate <slug>
```

This runs the archive-precondition checks (targets exist, no zero-op deltas, no
ADDED collisions, scenarios are well-formed) and reports anything that would
make the merge fail. Then read the delta files under
`openspec/changes/<slug>/specs/**/spec.md` to see the exact ADDED / MODIFIED /
REMOVED / RENAMED operations.

## Actually sync

Run `/cospec:archive` when the change is complete. The merge happens there, is
verified, and blocker check-offs fan out automatically. To sanity-check the
living specs on their own, run `cospec validate --specs`.
