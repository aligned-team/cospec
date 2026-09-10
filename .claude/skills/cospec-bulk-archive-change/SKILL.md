---
name: cospec-bulk-archive-change
description: Archive a batch of completed changes in dependency order, one cospec archive call at a time.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.7.1
  contentHash: sha256:3b79b54dd7063074630d38b7d2e3a71240c31e1410fef4577acc1efa21d44599
---

Archive a batch of completed changes, one at a time, in dependency order. Every
change is archived through its own `cospec archive` call — never a
hand-`mkdir`/`mv` of a change directory, no matter how many changes are in the
batch.

All work goes through `cospec`. Never call `openspec` directly.

## 1. List candidates

```
cospec list --json
```

Present the active changes to the user and let them select the completed subset
to archive in this pass.

## 2. Order providers before consumers

For each selected change, read its `blocking-changes.md`. If change B lists
change A as a blocker, A must archive before B. Where no dependency is declared,
fall back to creation order. Present the ordered batch to the user as a table
and get one confirmation before looping. If the user declines, stop here and
archive nothing — do not archive a subset, and do not re-ask with a smaller
batch unless the user asks for one.

## 3. Archive each change in order

For each change in the ordered batch:

```
cospec archive <slug>
```

Relay the summary it prints verbatim: what was archived, which spec deltas were
applied (`+a ~m -r →n`) or skipped, which sibling changes had blocker boxes
checked, and which changes are now unblocked. A non-zero exit is reported and
the batch continues to the next change — one failure is not fatal to the rest of
the batch.

## 4. On a per-change failure

Do NOT hand-`mv` the change directory, and do NOT force past a failure you do
not understand:

- "archived nothing (exited 0 but aborted)" means the spec deltas did not apply
  — fix the delta errors it printed, or re-run
  `cospec archive <slug> --skip-specs` if this change genuinely should not touch
  specs.
- Incomplete tasks block the archive — finish them, or re-run with
  `--force-incomplete` only after the user confirms the remaining tasks are
  intentionally abandoned.
- A genuine cross-change ADDED-collision (two changes in the batch add the same
  spec requirement) is caught by the later archive's own spec guard. Resolve it
  by editing the later change's delta — never `--force` past it.

## 5. Report and hand off

Summarize the batch: which changes archived cleanly, which failed and why, and
which changes are newly unblocked. Offer to `/cospec:apply` anything newly
unblocked.
