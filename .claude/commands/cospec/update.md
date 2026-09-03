---
name: "COSPEC: Update"
description: Revise an existing change's already-written artifacts and keep them coherent, without creating new artifacts or editing code.
category: Workflow
tags:
  - cospec
  - workflow
metadata:
  author: cospec
  generatedBy: cospec@0.6.0
  contentHash: sha256:5a2963ee5dc6dbc552c3323f817c3afcdd0996c567fe238c52fa0dc4e8eea217
---

Revise a change's **existing** artifacts and keep them coherent with one
another. This workflow never creates an artifact that does not exist yet (that
is `/cospec:continue`) and never edits code (that is `/cospec:apply`).

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

There is no `cospec update <slug>` CLI command for this — do not run one. (The
unrelated `cospec update` subcommand regenerates this repo's managed harness and
schema files; it has nothing to do with a change's artifacts.) This workflow is
built from `cospec status`, `cospec instructions`, and `cospec validate`.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`. If exactly
one active change exists, use it and announce `Using change: <slug>`, naming
`/cospec:update <other-slug>` as the override. If more than one is plausible,
ask the user which one, showing each change's type and gate state.

## 2. Read what exists

```
cospec status --change <slug> --json
```

Only artifacts reported `done` are in scope. Anything still missing is out of
scope here — note it and point the user at `/cospec:continue`.

## 3. Understand the request

- A specific revision ("the design now uses X") is the starting edit.
- A bare "update" / "make this coherent" is a coherence review: read the
  existing artifacts and check them against each other for contradictions, gaps,
  and duplication.

## 4. Reconcile

Re-read every artifact you touch from disk — never from what you remember of
this conversation; the user may have edited it since. Apply the requested edit,
then check every other existing artifact against it **in both directions**: an
edit to `tasks.md` can require revising `proposal.md`, not only the reverse.
Dependency order is a reading order, not a constraint on what may be revised.

If the change is already coherent, say so and edit nothing.

When a substantial rewrite is needed, get that artifact's authoritative rules,
template, and output path first:

```
cospec instructions <artifact> --change <slug> --json
```

Apply `context` and `rules` as constraints; never copy them into the artifact.
`blocking-changes.md`, the `specs/**/spec.md` deltas, and `verification.md` are
machine-parsed — keep the exact format. For the specs artifact, revise only the
delta files already under `openspec/changes/<slug>/specs/`; adding a new
capability file is `/cospec:continue`'s job.

## 5. Confirm each edit

Show each proposed revision and why, one artifact at a time, and write only
after the user confirms it. A rejected revision leaves that artifact unchanged.

## 6. Format, validate, and hand off

If this repo has a formatter task (for example `mise run format:fix`; check its
task list / docs), run it over the change directory before validating.

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING, re-running the formatter over anything you
edit. Then name the next step:

- artifacts still missing → `/cospec:continue`
- apply-ready and not yet implemented → `/cospec:apply`
- already implemented, and the revision changed what should be built →
  `/cospec:apply` again to carry the delta into code
- everything done → `/cospec:verify`, then `/cospec:archive`

If the request changes the change's _intent_ rather than refining it, do not
rewrite it in place — recommend `/cospec:new <type> <new-slug>` and stop.
