---
name: cospec-bulk-archive-change
description: Archive a batch of completed changes in dependency order, one cospec archive call at a time. Also use for a plural archive request — "cospec bulk-archive", "openspec bulk-archive", "archive all these changes", or "archive everything".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.10.0
  contentHash: sha256:7c6afc90c2cd28e6eabb077842d1275fd6eb383fb650a3d9ab6b2b339198e42b
---

Archive a batch of completed changes, one at a time, in dependency order. Every
change is archived through its own `cospec archive` call — never a
hand-`mkdir`/`mv` of a change directory, no matter how many changes are in the
batch.

All work goes through `cospec`. Never call `openspec` directly.

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

Each `cospec archive <slug>` call checks its own archive-slot collision before
touching any spec deltas, so a same-day slot collision is always caught before
that change's specs are written — never discovered mid-merge, after the fact.

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
