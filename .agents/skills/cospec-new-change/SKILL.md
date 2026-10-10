---
name: cospec-new-change
description: Scaffold a new change and show its typed artifact plan, then stop before authoring anything. Also use when the user says "cospec new" or "openspec new".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.10.0
  contentHash: sha256:52d9c929d16d0917a446dda12b92c2c8b335938748c8f04902badb3307fb8e33
---

Scaffold a new openspec change and stop. This workflow creates the change and
shows you its typed artifact plan — it does not author any artifact. Hand off to
`$cospec-ff-change (Codex) or /cospec-ff-change (other agents)` or `$cospec-continue-change (Codex) or /cospec-continue-change (other agents)` to actually write them.

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

## 1. Pick the type and slug

The argument after the command is either `<type>: <free text>` (for example
`feat: add a greeting endpoint`) or a bare description.

- If it begins with a known type followed by `:`, use that type.
- Otherwise ask the user to choose a type, offering this table:

| Type | What it is for | Artifacts |
| --- | --- | --- |
| build | Dependency or build-config change | proposal → blocking-changes → tasks (3 short artifacts) |
| chore | Maintenance not affecting src or tests | proposal → blocking-changes → tasks (3 short artifacts) |
| ci | CI configuration and automation pipeline change | proposal → blocking-changes → tasks (3 short artifacts) |
| docs | Documentation content only | proposal → blocking-changes → tasks (3 short artifacts) |
| feat | A new feature — the full workflow | proposal → blocking-changes, specs (+ design) → verification → tasks |
| fix | A bug fix | proposal → blocking-changes (+ specs, design) → verification → tasks |
| perf | A performance change with identical behavior | proposal (+ Benchmarks) → blocking-changes → verification → tasks |
| refactor | A structure change with no behavior change | proposal → blocking-changes, design → verification → tasks |
| revert | Roll back a previously shipped change | proposal (+ Reverts) → blocking-changes → tasks |
| style | Formatting or whitespace only | proposal → blocking-changes → tasks (3 short artifacts) |
| test | Tests for already-specified behavior | proposal → blocking-changes → tasks (3 short artifacts) |

Derive a kebab-case slug matching `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` from the
description, or ask the user for one.

## 2. Create the change

```
cospec new <type> <slug>
```

This writes `openspec/changes/<slug>/.openspec.yaml` (its `schema` is the type)
and prints the artifact plan — the exact set of artifacts this type requires.
Relay the plan to the user verbatim.

## 3. Show the first artifact, but do not write it

```
cospec instructions <first-artifact> --change <slug> --json
```

`<first-artifact>` is the first entry in the printed plan (typically
`proposal`). Show the user its template and per-type instruction so they know
what is coming next. Do NOT write the artifact file here — this workflow only
scaffolds and previews.

## 4. Stop and hand off

Tell the user the change is scaffolded and offer two ways to continue:

- `$cospec-ff-change (Codex) or /cospec-ff-change (other agents)` — author every remaining artifact in one pass.
- `$cospec-continue-change (Codex) or /cospec-continue-change (other agents)` — author one artifact at a time, reviewing each.

Do not create any artifact file yourself in this workflow.
