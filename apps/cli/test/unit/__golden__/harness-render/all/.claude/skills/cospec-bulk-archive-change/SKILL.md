---
name: cospec-bulk-archive-change
description: Archive a batch of completed changes in dependency order, one cospec archive call at a time. Also use for a plural archive request — "cospec bulk-archive", "openspec bulk-archive", "archive all these changes", or "archive everything".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@test
  contentHash: sha256:4b9ecff15e18997941bb3cfddf558ee099c04d752724f75cf0f1dfb55a1af99d
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
to archive in this pass. Do not auto-select; always let the user choose.

## 2. Load the project's archive inputs once for the batch

Choose one selected change from this root and run

```
cospec instructions archive --change "<slug>" --json
```

with `--store <id>` when a store is selected, as for every command here. Run it
once for the batch, not once per change. This lookup is advisory and optional:
it only supplies extra prompt inputs, so it must never block the batch. If it
exits non-zero or returns invalid JSON, continue the batch with no context and
no operation guidance. Do not report an error and do not stop.

A valid response may omit `context` and `operationGuidance`. Treat `context` as
a required prompt-level input across the batch: read and consider it, and apply
relevant project facts, conventions, and constraints. Treat `operationGuidance`
as optional additive advice: read and consider every entry, and follow entries
that are applicable and compatible with the built-in batch workflow.

Keep both fields separate from conflict analysis, explicit user choices,
resolved paths, CLI checks, and command contracts. If context conflicts with one
of those controlling inputs, report the conflict and preserve the controlling
value. If guidance is inapplicable or conflicts with a controlling input, do not
follow it and explain why. Do not infer skipped prompts, replacement paths, or
flags from either field, and do not copy their text verbatim into specs,
changes, or summaries. These are prompt-level behavior contracts, not
enforceable checks.

## 3. Gather each change's status and order the batch

For each selected change, run

```
cospec status --change "<slug>" --json
```

and read its artifact states, its tasks file, and its delta specs from
`artifactPaths.specs` (the existing output paths). Each delta spec's
`<capability-path>` is its path relative to the change's `specs/`; its
requirement names are its `### Requirement: <name>` lines. A change with no
`specs` entry, or an empty list, has no delta specs — never infer deltas from
another artifact.

Order providers before consumers: read each selected change's
`blocking-changes.md`, and if change B lists change A as a blocker, A must
archive before B. Where no dependency is declared, fall back to creation order:
the `created:` date in the change's `.openspec.yaml`, older first, ties by slug.

## 4. Detect spec conflicts

Build a map keyed by `<capability-path>`, the exact path relative to `specs/`:

```text
identity/user-auth -> [change-a, change-b]  <- CONFLICT (2+ changes)
billing/user-auth  -> [change-c]            <- OK (different full path)
```

A conflict exists when 2+ selected changes have delta specs for the exact same
`<capability-path>`. That holds whatever the operations are: two `MODIFIED`
deltas on one capability overwrite each other as silently as two `ADDED` ones
collide. Two changes that `ADD` the same requirement name are the case the later
`cospec archive` refuses with `archive/added-exists`.

## 5. Resolve each conflict

For each conflict, investigate the codebase:

1. **Read the delta specs** from each conflicting change to understand what each
   claims to add/modify.
2. **Search the codebase** for implementation evidence:
   - Look for code implementing requirements from each delta spec
   - Check for related files, functions, or tests
3. **Determine the resolution:**
   - If only one change is actually implemented -> include that one's delta and
     exclude the other's
   - If both implemented -> apply in chronological order (older first, newer
     overwrites), by `created:`, ties by slug
   - If neither implemented -> exclude both deltas and warn the user
4. **Record the resolution:**
   - An inclusion or exclusion decision for every delta spec, keyed by change
     and `<capability-path>`
   - Which included delta specs to apply and in what order
   - Rationale (what was found in codebase)

The resolution edits only the conflicting change's delta files — nothing else.
Never write a main spec under `openspec/specs/` (`cospec archive` does the
merge), never hand-`mv` or `mkdir` a change directory, and never touch another
artifact:

- **Included, newer, colliding on an `ADDED` requirement the older change also
  adds:** move that requirement from `## ADDED Requirements` to
  `## MODIFIED Requirements` in the newer change's delta, carrying the full
  updated requirement — its text and every scenario, the older change's
  scenarios included — so the later archive overwrites instead of refusing.
  `archive/scenario-preservation` refuses a `MODIFIED` that drops one.
- **Excluded:** remove its colliding `### Requirement:` blocks from that
  change's delta file. When no operation is left in the file, delete the file,
  provided the change keeps another delta.
- A change that would be left with no delta specs where its type requires specs
  is shown `Blocked`, never edited into invalidity.

## 6. Show the plan and confirm once

Present one table: each change, its artifacts, tasks, delta specs, conflicts and
status (`Ready`, `Ready*` for a resolved conflict, `Warn` for incomplete
artifacts or tasks, `Blocked`). Under it, show each conflict's resolution and
rationale, each proposed delta edit, and the final archive order — dependency
order first, collision order within a capability; report it when the two
disagree, and keep the dependency order.

Ask once: one confirmation covers the batch and the edits. If the user declines, edit
nothing and archive nothing — do not archive a subset, and do not re-ask with a
smaller batch unless the user asks for one.

## 7. Apply the edits

Make the confirmed delta edits, and nothing else.

## 8. Validate and archive each change in order

For each change in the resolved order, when step 7 edited it, first run

```
cospec validate <slug> --strict
```

Validate it here, after every change ahead of it has archived, not before the
loop: a retargeted `MODIFIED` names a requirement that reaches the living spec
only when the older change archives, and validation reads the living specs as
they stand (`archive/new-spec-non-added` refuses a `MODIFIED` on a capability
with no living spec yet). A failure is that change's failure: report it, do not
archive it, and continue with the rest of the batch.

Then archive it:

```
cospec archive <slug>
```

Each call runs both hard gates for its change, `archive/verification-incomplete`
and `archive/scenario-preservation`. Run it as printed, and never pass a
`--force*` flag to get past a collision or a gate. Relay the summary it prints verbatim: what was
archived, which spec deltas were applied (`+a ~m -r →n`) or skipped, which
sibling changes had blocker boxes checked, and which changes are now unblocked.
A non-zero exit is reported and the batch continues to the next change — one
failure is not fatal to the rest of the batch.

Each `cospec archive <slug>` call checks its own archive-slot collision before
touching any spec deltas, so a same-day slot collision is always caught before
that change's specs are written — never discovered mid-merge, after the fact.

## 9. On a per-change failure

Do NOT hand-`mv` the change directory, and do NOT force past a failure you do
not understand:

- "archived nothing (exited 0 but aborted)" means the spec deltas did not apply
  — fix the delta errors it printed, or re-run
  `cospec archive <slug> --skip-specs` if this change genuinely should not touch
  specs.
- Incomplete tasks block the archive — finish them, or re-run with
  `--force-incomplete` only after the user confirms the remaining tasks are
  intentionally abandoned.
- A cross-change collision step 4 missed (two changes in the batch add the same
  spec requirement) is caught by the later archive's own spec guard,
  `archive/added-exists`. Resolve it as step 5 does, by editing that change's
  delta — never `--force` past it.

## 10. Report and hand off

Summarize the batch: which changes archived cleanly, which failed and why, which
were skipped, how each conflict was resolved, and which changes are newly
unblocked. Offer to `/cospec:apply` anything newly
unblocked.
