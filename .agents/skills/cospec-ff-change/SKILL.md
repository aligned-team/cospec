---
name: cospec-ff-change
description: Author every remaining artifact on an already-scaffolded change in one pass, then validate. Also use when the user says "cospec ff", "cospec fast-forward", or "openspec ff".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.10.0
  contentHash: sha256:8afc95693415d2f288efe40c1123673feb83cdb74af489d8da7b2dc226cc7240
---

Fast-forward an already-scaffolded change: author every remaining artifact in
one pass, then validate. Use this after `$cospec-new-change (Codex) or /cospec-new-change (other agents)` has already created the
change. Do NOT scaffold a new change here — if none exists yet, stop and point
the user at `$cospec-new-change (Codex) or /cospec-new-change (other agents)` instead.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

`cospec` is self-describing about format — you do not need to explore the repo to
learn how an artifact is shaped. `cospec instructions <artifact> --change <slug>
--json` prints the authoritative template, per-type format, and project rules for
each artifact. Trust that output for format: do NOT read `openspec/schemas/`,
`openspec/config.yaml`, or other repo files to reverse-engineer an artifact's
shape. That rule is about format, not subject matter: step 3 inspects the project
the change is about before you draft.

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
and announce `Using change: <slug>`. If more than one is plausible, ask the user
which one, showing each change's type and gate state.

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
   itself. Re-read every completed dependency artifact from disk before writing
   against it, even if you wrote it earlier in this session — the user may have
   edited it since.
3. **Inspect the relevant project before drafting.** Read `context` and `rules`
   first, as step 2 gave them to you, then inspect relevant implementation, nearby
   tests, configuration, and documentation outside `openspec/`. Keep inspection
   read-only and proportional to the change; reuse findings for later artifacts and
   inspect more only as needed.

   Identify the target project from the request and project context; the planning
   home may be separate from the code. If the target is unclear, ask. For greenfield
   or non-code changes, inspect the available structure and relevant documents. If
   source is unavailable, state the limitation and ask when it materially affects
   the plan.

   Ground scope, approach, and tasks in what you find. Distinguish observed behavior
   from assumptions and proposed additions; surface conflicts with existing specs
   instead of silently deciding which is correct.

   Do this discovery now, rather than leaving generic "explore the codebase" or
   "make a plan" tasks for implementation. Keep any necessary follow-up investigation
   specific to an unresolved question.

4. Write the artifact at the path the instructions name, following the format
   exactly. `blocking-changes.md`, the `specs/**/spec.md` deltas, and
   `verification.md` are machine-parsed — small deviations fail validation.
5. Repeat.

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
`$cospec-apply-change (Codex) or /cospec-apply-change (other agents)` when they want to implement it. Do not start implementation
here.
