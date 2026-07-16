---
description: Author every remaining artifact on an already-scaffolded change in one pass, then validate.
metadata:
  author: cospec
  generatedBy: cospec@0.5.3
  contentHash: sha256:45fdafc162e7a4e5c780f12716917010320de78ecd125678116282df3fd73b9d
---

Fast-forward an already-scaffolded change: author every remaining artifact in
one pass, then validate. Use this after `/cospec-new` has already created the
change. Do NOT scaffold a new change here — if none exists yet, stop and point
the user at `/cospec-new` instead.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

`cospec` is self-describing — you do not need to explore the repo to learn what
to write. `cospec instructions <artifact> --change <slug> --json` prints the
authoritative template, per-type format, and project rules for each artifact.
Trust that output: do NOT read `openspec/schemas/`, `openspec/config.yaml`, or
other repo files to reverse-engineer an artifact's shape.

## 1. Pick the change

```
cospec list --json
```

If the user named a change, use it. Otherwise choose the in-progress one; if
more than one is plausible, ask with AskUserQuestion, showing each change's type
and gate state.

## 2. Read the plan

```
cospec status --change <slug> --json
```

Read the type's full artifact plan and which artifacts in `apply.requires` are
still missing. Respect the plan exactly: write every required artifact, and add
nothing the type forbids.

## 3. Author every remaining artifact

Loop until every artifact in `apply.requires` is written:

1. `cospec status --change <slug> --json` — read which artifacts are ready to
   write next (their dependencies are satisfied) and which are still waiting.
2. For each ready artifact, run
   `cospec instructions <artifact> --change <slug> --json`. Treat `context` and
   `rules` as constraints on how you write — never copy them into the artifact
   itself.
3. Write the artifact at the path the instructions name, following the format
   exactly. `blocking-changes.md`, the `specs/**/spec.md` deltas, and
   `verification.md` are machine-parsed — small deviations fail validation.
4. Repeat.

For `blocking-changes.md`, scan the other active changes and the archive as the
instruction directs, classify each dependency as hard (Blocked by) or soft
(Soft-blocked by), and confirm the list with the user before finalizing it.

## 4. Format, then validate

If this repo has a formatter task (for example `mise run format:fix`; check its
task list / docs), run it over the change directory now — an artifact that
passes `validate --strict` can still fail the repo's format gate because the
formatter rewraps markdown, and formatting must never be committed unformatted.

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING; if you edit an artifact to fix one, re-run
the formatter over it before re-validating. Re-run until it is clean.

## 5. Hand off

Tell the user the change is apply-ready and that the next step is
`/cospec-apply` when they want to implement it. Do not start implementation
here.
