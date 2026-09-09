---
name: "COSPEC: Continue"
description: Resume a partially-built change and finish its remaining artifacts.
category: Workflow
tags:
  - cospec
  - workflow
metadata:
  author: cospec
  generatedBy: cospec@0.7.0
  contentHash: sha256:2b7c61ad71a36a9dbe6e864a51a0c5e0ca2f115240ccb1abb1a38279e04869d4
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

If the user named a change, use it. If exactly one active change exists, use it
and announce `Using change: <slug>`, naming `/cospec:continue <other-slug>` as
the override. If more than one is plausible, ask the user which one, showing
each change's type and gate state.

## 2. Find what is missing

```
cospec status --change <slug> --json
```

Read which `apply.requires` artifacts are still missing and which are ready to
write next.

## 3. Finish the artifacts

Run the same loop as `/cospec:propose` step 3: for each ready artifact, call
`cospec instructions <artifact> --change <slug> --json`, write it to the named
path, and repeat until every required artifact exists. Apply `context` and
`rules` as constraints, never copy them into the output. Re-read every completed
dependency artifact from disk before writing against it — this change was
started in an earlier session, so nothing you remember about its artifacts is
trustworthy. Follow the machine-parsed formats for `blocking-changes.md`, the
`specs/**/spec.md` deltas, and `verification.md` exactly.

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
user the change is apply-ready — next step `/cospec:apply`.
