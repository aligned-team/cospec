---
name: cospec-verify-change
description: Dress-rehearse a change before archiving — validate strictly, walk the verification ledger, and name the hard archive gates. Also use when the user says "cospec verify" or "openspec verify".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.10.0
  contentHash: sha256:09e5eb18bdf8fd4a426182e609bfcf375700a289a0aeb33d367f480b89fc8920
---

Dress-rehearse a change before archiving it. This workflow does not archive — it
runs `cospec validate --strict`, walks the verification ledger to observed
evidence, and names the hard gates `/cospec:archive` will enforce.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

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

## 2. Validate

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING it reports before continuing. This includes
the archive-precondition checks (targets exist, no zero-op deltas, no ADDED
collisions, scenarios are well-formed) — do not proceed to the ledger walk with
a validation failure outstanding.

## 3. Walk the verification ledger

Read `openspec/changes/<slug>/verification.md`. For each row shaped
`- [ ] N.M @layer (owner) probe -> result`:

- Run the probe.
- Record the actual observed result after `->`, replacing the placeholder.
- Flip the box to `[x]` once the observed result is recorded.
- If you will not run a row, do not fake it: write
  `- [~] N.M @layer (owner) probe -> defer: <honest reason>` instead.

No bare `- [ ]` row may remain when this step is done. Do not edit the ledger to
invent evidence for a probe you did not actually run.

## 4. Confirm tasks are complete

Read `openspec/changes/<slug>/tasks.md`. Every box must be `[x]`. If any are
not, finish the remaining work (or tell the user which are outstanding) before
moving on.

## 5. Name the gates archive will enforce

Tell the user `/cospec:archive` runs two hard gates, neither of which accepts
`--force`:

- `archive/verification-incomplete` — fails if any ledger row is still a bare
  `- [ ]`.
- `archive/scenario-preservation` — fails if a spec delta would drop a scenario
  the living spec already has.

This workflow only checks these preconditions; it does not run the archive.

## 6. Hand off

Tell the user the change is dress-rehearsed and the next step is
`/cospec:archive`.
