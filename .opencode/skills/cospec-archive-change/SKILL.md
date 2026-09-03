---
name: cospec-archive-change
description: Archive a completed change — validate, merge specs, verify, and fan blockers out.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.6.0
  contentHash: sha256:3fa6863e9a9556a7bde60c360022b022749760670c8eec4f85a7f2d0da69e904
---

Archive a completed change. `cospec archive` validates it, merges its spec
deltas into the living specs, verifies the move actually happened, and fans
blocker check-offs out to sibling changes — as one coupled step.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`: if exactly
one active change exists, use it and announce `Using change: <slug>`; if more
than one is plausible, ask.

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

## 4. Retiring a capability

A change whose REMOVED operations take the last requirement out of a capability
is retiring that capability, and the merge deletes its
`openspec/specs/<capability-path>/spec.md` outright (the file's `## Purpose`
goes with it). That only happens when the change's `.openspec.yaml` declares
`retire_capabilities: true`. Without the marker the merge refuses rather than
leaving an empty `## Requirements` section behind — so if archive reports that,
the fix is either to add the marker (when the retirement is intended) or to keep
at least one requirement in the delta.

When a capability is retired, say so in the summary: name the deleted `spec.md`,
quote its Purpose, and tell the user how to recover it (a `git checkout` of that
path when the spec lived in this checkout).

Never bypass validation. If a change is reported as now unblocked, offer to
`/cospec-apply` it next.
