---
name: cospec-apply-change
description: Run the apply gate for a change and implement its tasks, obeying the gate's exit code. Also use when the user says "cospec apply" or "openspec apply".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.11.0
  contentHash: sha256:beca9525bfb14e05457e411c750775c8c627bcb4f7a39dce5ece2f6606cd81bb
---

Run the deterministic apply gate for a change, then implement its tasks. The
gate is a command whose exit code you must obey — never re-derive it by reading
`blocking-changes.md` yourself.

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

## 2. Run the gate

```
cospec apply <slug> --json
```

Obey the exit code:

- **exit 0 — clear.** Read the returned `apply.contextFiles` and `apply.tasks`.
  Work through the pending tasks in order, marking each `- [x]` in `tasks.md`
  only once the behavior the specs and tasks describe is actually implemented —
  a partial or narrowed implementation is not a checked box. Pair every code
  task with its test/verification task. The `gate.synced` list shows blocker
  boxes the command auto-checked because their dependency is already archived —
  trust it over a manual read of the file.

  The same `apply` object may carry `apply.context` and
  `apply.operationGuidance`, the project's own inputs from its config. Treat
  `context` as a required
  prompt-level input. Read and consider it, and apply relevant project facts,
  conventions, and constraints while implementing. Treat `operationGuidance` as
  optional additive advice. Read and consider every entry, and follow entries
  that are applicable and compatible with the built-in workflow.

  Keep both fields separate from the gate, the returned state, tasks, progress,
  `contextFiles`, and the built-in `instruction`. They are not evidence of task
  completion, do not replace the built-in instruction, and do not permit
  bypassing a blocked state. If context conflicts with the built-in instruction,
  an explicit user choice, or a CLI-controlled value, report the conflict and
  preserve the controlling value. If guidance is inapplicable or conflicts with
  those controlling inputs, do not follow it and explain why. Do not copy
  `context` or `operationGuidance` verbatim into implementation files or
  planning artifacts unless the user separately asks for that content. These are
  prompt-level behavior contracts, not enforceable checks.

  If a task needs work beyond what the specs and tasks describe, or you find
  yourself tempted to drop, narrow, defer, or carve an exception out of
  specified behavior to make it fit: stop, name the added scope to the user, and
  ask. Never absorb it silently.

- **exit 2 — blocked.** STOP. `gate.reason` is either `missing-artifacts` or
  `hard-blockers`. Relay each listed item and what it provides. For a hard
  blocker, name the blocking change and suggest implementing and archiving it
  first. Do not work around the gate.
- **exit 3 — soft-blocked.** List each soft blocker and what degrades without
  it. Ask the user to confirm; only then re-run
  `cospec apply <slug> --allow-soft --json`. Never skip silently.

## 3. Finish

When every task is checked, tell the user the change is ready to archive — next
step `/cospec-archive`.
