---
description: Resume a partially-built change and finish its remaining artifacts.
metadata:
  author: cospec
  generatedBy: cospec@0.4.0
  contentHash: sha256:f5ddafb268917ae8fd6f1d8846b81ecff20c4aad942acc3861421e7838d350f2
---

Resume a change that was started but is not yet apply-ready, and finish its
remaining artifacts. All work goes through `cospec`.

`cospec` is self-describing: `cospec status` names what is missing and
`cospec instructions <artifact>` prints the authoritative template, format, and
project rules for it. Trust that output — do NOT read `openspec/schemas/` or
other repo files to reverse-engineer an artifact's shape.

## 1. Pick the change

```
cospec list --json
```

If the user named a change, use it. Otherwise choose the in-progress one; if
more than one is plausible, ask with AskUserQuestion, showing each change's type
and gate state.

## 2. Find what is missing

```
cospec status --change <slug> --json
```

Read which `apply.requires` artifacts are still missing and which are ready to
write next.

## 3. Finish the artifacts

Run the same loop as `/cospec-propose` step 3: for each ready artifact, call
`cospec instructions <artifact> --change <slug> --json`, write it to the named
path, and repeat until every required artifact exists. Apply `context` and
`rules` as constraints, never copy them into the output. Follow the
machine-parsed formats for `blocking-changes.md`, the `specs/**/spec.md` deltas,
and `verification.md` exactly.

## 4. Format, validate, and hand off

If this repo has a formatter task (for example `mise run format:fix`; check its
task list / docs), run it over the change directory before validating — an
artifact that passes `validate --strict` can still fail the repo's format gate
because the formatter rewraps markdown, and formatting must never be committed
unformatted.

```
cospec validate <slug> --strict
```

Fix all issues (re-running the formatter over anything you edit), then tell the
user the change is apply-ready — next step `/cospec-apply`.
