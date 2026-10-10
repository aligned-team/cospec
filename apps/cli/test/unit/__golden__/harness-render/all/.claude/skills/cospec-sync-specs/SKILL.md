---
name: cospec-sync-specs
description: Merge a change's delta specs into the main specs without archiving it, exactly as archive would. Also use when the user says "cospec sync specs", "sync the specs", or "openspec sync".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@test
  contentHash: sha256:33c9f44d5ae7cc592e088cdabe8d7156787fa10cbd8b74ecfd647a09a7d41c45
---

Merge a change's delta specs into the main specs under `openspec/specs/` without
archiving the change. `cospec sync-specs` runs the archive's own merge — the
pinned OpenSpec archive, on a scratch copy of the specs — and copies back only
the main-spec files it changed, so the result is byte-for-byte what
`cospec archive` would write. The change stays active, and its later archive is
a no-op merge.

**Project check:** These steps expect a project that already uses cospec. Before
the first step that writes anything (`cospec new`, `cospec archive`,
`cospec sync-specs`, or authoring an artifact file), confirm the project has a
root: run `cospec list --json` (with `--store <id>` when a store is selected,
since the store is then the root) and read `root`. A root object means the
project is set up. `"root": null` means it is not — there is no `openspec/`
directory here, and a write such as `cospec new` would create one as a side
effect. The command also exits non-zero, which is that answer rather than a
broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` entry's `message` starts
with `Declared in` or `Invalid store declaration in` and names this project's
`openspec/config.yaml` (or `config.yml`), the project does use cospec through a
store it declares, which this machine cannot resolve (the store is not
registered, or the `store:` line is malformed). Do not treat it as uninitialized
and do not take either branch below: stop before writing and show the user that
entry's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was
reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming
  cospec, naming this skill, or running its command. Stop using cospec and
  answer the request normally, as you would with no cospec installed. Do not ask
  them to set anything up and do not mention cospec setup.
- **Explicit cospec request**: the user named cospec, named this skill, or ran
  its command. Stop before writing and ask how to proceed: set this project up
  (`cospec init`), target a store they already have (`--store <id>`), or
  continue without cospec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run
`cospec init` until the user asks for it, do not hand-create `openspec/` files,
and do not let a command create it.

**Choosing a change:** When a step asks you to choose among changes and the
choice is not obvious, run `cospec list --json` (with `--store <id>` when a
store is selected) and keep its order, which is most recently modified first.
Never pass `--sort name`. Present the top 3-4 changes as options, each showing
its name, its type, its gate state, its task progress (for example "0/5 tasks",
"complete", or "no tasks"), and how recently it was modified, read from the
`lastModified` field. Mark the first option "(Recommended)", since the most
recently modified change is the likeliest one. Ask the user to pick, and never
guess.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`: if exactly
one active change exists, use it and announce `Using change: <slug>`. When
several active changes exist, choose as **Choosing a change** above says.

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
