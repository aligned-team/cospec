Archive a completed change. `cospec archive` validates it, merges its spec
deltas into the living specs, verifies the move actually happened, and fans
blocker check-offs out to sibling changes — as one coupled step.

{{ROOT_GUARD}}

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`: if exactly
one active change exists, use it and announce `Using change: <slug>`; if more
than one is plausible, ask.

**Load the project's archive inputs before the archive checks.** After the
change is selected, run

```
cospec instructions archive --change "<slug>" --json
```

with `--store <id>` when a store is selected, as for every command here. This
lookup is advisory and optional: it only supplies extra prompt inputs, so it
must never block archiving. If it exits non-zero or returns invalid JSON,
continue the archive workflow with no context and no operation guidance. Do not
report an error and do not stop.

A successful response may omit both optional fields. Treat `context` as a
required prompt-level input: read and consider it, and apply relevant project
facts, conventions, and constraints. Treat `operationGuidance` as optional
additive advice: read and consider every entry, and follow entries that are
applicable and compatible with the built-in archive workflow.

Keep both fields separate from built-in steps, explicit user choices, resolved
paths, CLI checks, and command contracts. If context conflicts with one of those
controlling inputs, report the conflict and preserve the controlling value. If
guidance is inapplicable or conflicts with a controlling input, do not follow it
and explain why. Do not infer replacement paths, skipped prompts, or flags from
either field, and do not copy their text verbatim into specs, change artifacts,
or archive summaries unless the user separately asks for it. These are
prompt-level behavior contracts, not enforceable checks.

## 2. Archive

```
cospec archive <slug>
```

Relay the summary it prints verbatim: what was archived, which spec deltas were
applied (`+a ~m -r →n`) or skipped, which sibling changes had blocker boxes
checked, and which changes are now unblocked.

A change that introduces a brand-new capability (no living spec yet) may ADD
requirements there, and a REMOVED there is a no-op the merge warns about;
`cospec validate` refuses a MODIFIED or RENAMED op targeting it before archive
ever runs the merge.

A change whose specs were synced early with `[[opsx:if-workflow sync-specs]]/cospec:sync-specs[[opsx:else]]cospec sync-specs <slug>[[opsx:end]]` archives as a
no-op merge: the summary says the specs were already in sync, and both hard
gates (`archive/verification-incomplete`, `archive/scenario-preservation`) still
run.

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
`[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]` it next.
