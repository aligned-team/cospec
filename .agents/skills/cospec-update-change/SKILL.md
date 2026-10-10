---
name: cospec-update-change
description: Revise an existing change's already-written artifacts and keep them coherent, without creating new artifacts or editing code. Also use when the user says "cospec update change", "update the change", or "openspec update change" — never for the unrelated `cospec update` CLI command, which regenerates this repo's managed harness and schema files, not a change's artifacts.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.10.0
  contentHash: sha256:dfc27a414737ed483c1fe993b7bba2589095007a86a1711a685037811e26bf2c
---

Revise a change's **existing** artifacts and keep them coherent with one
another. This workflow never creates an artifact that does not exist yet (that
is `$cospec-continue-change (Codex) or /cospec-continue-change (other agents)`) and never edits code (that is `$cospec-apply-change (Codex) or /cospec-apply-change (other agents)`).

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

There is no `cospec update <slug>` CLI command for this — do not run one. (The
unrelated `cospec update` subcommand regenerates this repo's managed harness and
schema files; it has nothing to do with a change's artifacts.) This workflow is
built from `cospec status`, `cospec instructions`, and `cospec validate`.

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

If the user named one, use it. Otherwise run `cospec list --json`. If exactly
one active change exists, use it and announce `Using change: <slug>`, naming
`$cospec-update-change (Codex) or /cospec-update-change (other agents) <other-slug>` as the override. If more than one is plausible,
ask the user which one, showing each change's type and gate state.

## 2. Read what exists

```
cospec status --change <slug> --json
```

Only artifacts reported `done` are in scope. Anything still missing is out of
scope here — note it and point the user at `$cospec-continue-change (Codex) or /cospec-continue-change (other agents)`.

## 3. Understand the request

- A specific revision ("the design now uses X") is the starting edit.
- A bare "update" / "make this coherent" is a coherence review: read the
  existing artifacts and check them against each other for contradictions, gaps,
  and duplication.

## 4. Reconcile

Re-read every artifact you touch from disk — never from what you remember of
this conversation; the user may have edited it since. **Draft** the requested
edit — in the conversation, not in files — then check every other existing
artifact against the drafted edit **in both directions**: an edit to `tasks.md`
can require revising `proposal.md`, not only the reverse. Dependency order is a
reading order, not a constraint on what may be revised.

If the change is already coherent, say so and **propose no revisions**.

When a substantial rewrite is needed, get that artifact's authoritative rules,
template, and output path first:

```
cospec instructions <artifact> --change <slug> --json
```

Apply `context` and `rules` as constraints; never copy them into the artifact.
`blocking-changes.md`, the `specs/**/spec.md` deltas, and `verification.md` are
machine-parsed — keep the exact format. For the specs artifact, revise only the
delta files already under `openspec/changes/<slug>/specs/`; adding a new
capability file is `$cospec-continue-change (Codex) or /cospec-continue-change (other agents)`'s job.

## 5. Confirm each edit

Show each proposed revision and why, one artifact at a time, and write only
after the user confirms it. A rejected revision leaves that artifact unchanged.
This step performs every artifact write in this workflow; no earlier step edits
an artifact.

## 6. Format, validate, and hand off

If this repo has a formatter task (for example `mise run format:fix`; check its
task list / docs), run it over the change directory before validating.

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING, re-running the formatter over anything you
edit. Then name the next step:

- artifacts still missing → `$cospec-continue-change (Codex) or /cospec-continue-change (other agents)`
- apply-ready and not yet implemented → `$cospec-apply-change (Codex) or /cospec-apply-change (other agents)`
- already implemented, and the revision changed what should be built →
  `$cospec-apply-change (Codex) or /cospec-apply-change (other agents)` again to carry the delta into code
- everything done → `$cospec-verify-change (Codex) or /cospec-verify-change (other agents)`, then `$cospec-archive-change (Codex) or /cospec-archive-change (other agents)`

If the request changes the change's _intent_ rather than refining it, do not
rewrite it in place — recommend `$cospec-new-change (Codex) or /cospec-new-change (other agents) <type> <new-slug>` and stop.
