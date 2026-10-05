Merge a change's delta specs into the main specs under `openspec/specs/` without
archiving the change. `cospec sync-specs` runs the archive's own merge — the
pinned OpenSpec archive, on a scratch copy of the specs — and copies back only
the main-spec files it changed, so the result is byte-for-byte what
`cospec archive` would write. The change stays active, and its later archive is
a no-op merge.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`: if exactly
one active change exists, use it and announce `Using change: <slug>`; if more
than one is plausible, ask.

## 2. Preview the merge

```
cospec validate <slug>
```

This runs the archive-precondition checks (targets exist, no zero-op deltas, no
ADDED collisions, scenarios are well-formed) and reports anything that would
make the merge fail. Then read the delta files under
`openspec/changes/<slug>/specs/**/spec.md` and tell the user which main specs
the sync will create, change or delete: the ADDED / MODIFIED / REMOVED / RENAMED
operations per capability, and any retirement (below) with its marker.

A delta that targets a capability with no living spec yet may ADD requirements
there, and a REMOVED there is a no-op the merge warns about; a MODIFIED or
RENAMED op targeting it is a validate-time ERROR (`archive/new-spec-non-added`).

## 3. Sync

```
cospec sync-specs <slug>
```

Relay what it prints: one `Synced:` line per main-spec file written or deleted
and the merge's totals, or that the specs were already in sync. The merge is the
archive's own, so a refusal here is the refusal archive would give — relay it
verbatim and fix what it names; never edit a main spec by hand to get past it.
Nothing is written when it refuses, and the change is never archived by this
step.

## Retiring a capability

If a delta's REMOVED operations take the last requirement out of a capability,
the merge deletes that capability's `openspec/specs/<capability-path>/spec.md`
rather than leaving an empty `## Requirements` section. That is only permitted
when the change's `.openspec.yaml` declares `retire_capabilities: true`; without
the marker the merge refuses and reports the missing marker as the blocking
condition. Deleting the file also deletes its `## Purpose` — name both when you
report a retirement, and give the user a way to recover the file.

## Afterwards

The change is still active: finish its tasks and verification, then run
`/cospec:archive`. Its merge finds the specs already in sync, and both hard
archive gates still run. To sanity-check the living specs on their own, run
`cospec validate --specs`.
