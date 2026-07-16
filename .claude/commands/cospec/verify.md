---
name: "COSPEC: Verify"
description: Dress-rehearse a change before archiving — validate strictly, walk the verification ledger, and name the hard archive gates.
category: Workflow
tags:
  - cospec
  - workflow
metadata:
  author: cospec
  generatedBy: cospec@0.5.4
  contentHash: sha256:51f08c47b884a9466591d5b559af25a5d9b80545431b1eb06d7af18ae414eb8c
---

Dress-rehearse a change before archiving it. This workflow does not archive — it
runs `cospec validate --strict`, walks the verification ledger to observed
evidence, and names the hard gates `/cospec:archive` will enforce.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json` and pick, or
ask.

## 2. Validate

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING it reports before continuing. This includes
the archive-precondition checks (targets exist, no zero-op deltas, no ADDED
collisions, scenarios are well-formed) — do not proceed to the ledger walk with
a validation failure outstanding.

## 3. Walk the verification ledger

Read `openspec/changes/<slug>/verification.md`. For each row shaped
`- [ ] N.M @layer (owner) probe -> result`:

- Run the probe.
- Record the actual observed result after `->`, replacing the placeholder.
- Flip the box to `[x]` once the observed result is recorded.
- If you will not run a row, do not fake it: write
  `- [~] N.M @layer (owner) probe -> defer: <honest reason>` instead.

No bare `- [ ]` row may remain when this step is done. Do not edit the ledger to
invent evidence for a probe you did not actually run.

## 4. Confirm tasks are complete

Read `openspec/changes/<slug>/tasks.md`. Every box must be `[x]`. If any are
not, finish the remaining work (or tell the user which are outstanding) before
moving on.

## 5. Name the gates archive will enforce

Tell the user `/cospec:archive` runs two hard gates, neither of which accepts
`--force`:

- `archive/verification-incomplete` — fails if any ledger row is still a bare
  `- [ ]`.
- `archive/scenario-preservation` — fails if a spec delta would drop a scenario
  the living spec already has.

This workflow only checks these preconditions; it does not run the archive.

## 6. Hand off

Tell the user the change is dress-rehearsed and the next step is
`/cospec:archive`.
