---
name: cospec-archive-change
description: Archive a completed change — validate, merge specs, verify, and fan blockers out.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.5.2
  contentHash: sha256:ca020d07b9178b6e14f5be79916870a18884c48a6263faef141bd31f432d7def
---

Archive a completed change. `cospec archive` validates it, merges its spec
deltas into the living specs, verifies the move actually happened, and fans
blocker check-offs out to sibling changes — as one coupled step.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json` and pick, or
ask.

## 2. Archive

```
cospec archive <slug>
```

Relay the summary it prints verbatim: what was archived, which spec deltas were
applied (`+a ~m -r →n`) or skipped, which sibling changes had blocker boxes
checked, and which changes are now unblocked.

## 3. On failure

If it exits non-zero, relay the error output verbatim. Do NOT hand-`mv` the
change directory into `openspec/changes/archive/`, and do NOT re-run with a flag
you do not understand:

- "archived nothing (exited 0 but aborted)" means the spec deltas did not apply
  — fix the delta errors it printed, or, if this change genuinely should not
  touch specs, re-run `cospec archive <slug> --skip-specs`.
- Incomplete tasks block the archive. Finish them, or re-run with
  `--force-incomplete` only after the user confirms the remaining tasks are
  intentionally abandoned.

Never bypass validation. If a change is reported as now unblocked, offer to
`/cospec-apply` it next.
