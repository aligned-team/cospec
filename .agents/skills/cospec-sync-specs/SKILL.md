---
name: cospec-sync-specs
description: Explain how spec sync works (it runs inside archive) and preview what would merge. Also use when the user says "cospec sync specs", "sync the specs", or "openspec sync".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.8.2
  contentHash: sha256:1bfa89a12c71041a0dfa9dc59c5007a6cae904ca8a880cb87dbaad91fa4b4814
---

Explain and preview spec synchronization. Spec sync is not a standalone step in
cospec.

Delta specs in a change are merged into the living specs under `openspec/specs/`
**only** by `cospec archive`, which applies the merge and then verifies it as
one coupled operation. There is no supported mid-flight "sync now without
archiving" path. This is deliberate: a partial merge would leave a tree that
neither validates nor archives cleanly.

## Preview what would merge

If the user did not name a change, run `cospec list --json`: if exactly one
active change exists, use it and announce `Using change: <slug>`; if more than
one is plausible, ask.

```
cospec validate <slug>
```

This runs the archive-precondition checks (targets exist, no zero-op deltas, no
ADDED collisions, scenarios are well-formed) and reports anything that would
make the merge fail. Then read the delta files under
`openspec/changes/<slug>/specs/**/spec.md` to see the exact ADDED / MODIFIED /
REMOVED / RENAMED operations.

A delta that targets a capability with no living spec yet may only ADD
requirements — any MODIFIED, REMOVED, or RENAMED op there is a validate-time
ERROR (`archive/new-spec-non-added`), not something that surfaces later at merge
time.

## Retiring a capability

If a delta's REMOVED operations take the last requirement out of a capability,
the merge deletes that capability's `openspec/specs/<capability-path>/spec.md`
rather than leaving an empty `## Requirements` section. That is only permitted
when the change's `.openspec.yaml` declares `retire_capabilities: true`; without
the marker the merge refuses and reports the missing marker as the blocking
condition. Deleting the file also deletes its `## Purpose` — name both when you
report a retirement, and give the user a way to recover the file.

## Actually sync

Run `$cospec-archive-change (Codex) or /cospec-archive-change (other agents)` when the change is complete. The merge happens there, is
verified, and blocker check-offs fan out automatically. To sanity-check the
living specs on their own, run `cospec validate --specs`.
