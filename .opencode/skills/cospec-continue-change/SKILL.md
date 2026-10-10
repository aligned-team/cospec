---
name: cospec-continue-change
description: Resume a partially-built change and finish its remaining artifacts. Also use when the user says "cospec continue" or "openspec continue".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.11.0
  contentHash: sha256:1982b017073af0ee9e2fcf93d1603cfba8d7e423647314f60ea1f6a383b1e399
---

Resume a change that was started but is not yet apply-ready, and finish its
remaining artifacts. All work goes through `cospec`.

`cospec` is self-describing: `cospec status` names what is missing and
`cospec instructions <artifact>` prints the authoritative template, format, and
project rules for it. Trust that output — do NOT read `openspec/schemas/` or
other repo files to reverse-engineer an artifact's shape.

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

## 1. Pick the change

```
cospec list --json
```

If the user named a change, use it. If exactly one active change exists, use it
and announce `Using change: <slug>`, naming `/cospec-continue <other-slug>` as
the override. When several active changes exist, choose as **Choosing a change**
above says.

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
user the change is apply-ready — next step `/cospec-apply`.
