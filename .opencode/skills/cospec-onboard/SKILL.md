---
name: cospec-onboard
description: Walk a first-time user through one real cospec change end to end, narrating each step. Also use when the user says "cospec onboard" or "openspec onboard".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.11.0
  contentHash: sha256:d24bce8be6c66e266d4f5e83ab8d4ff054e4d5fa3df1190569490385bb49eea1
---

Walk a first-time user through one real cospec change, end to end, narrating
each step before running it. This is a tutorial: explain, then do, then show the
result, then pause for the user before continuing. Stop gracefully at any point
the user wants to.

All work goes through `cospec`. Never call `openspec` directly.

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

## 1. Preflight

```
cospec doctor
```

Confirm `cospec` is set up in this repo (schemas present, no drift). Explain
what `doctor` checked before moving on.

## 2. Find a small real task

Look for something genuinely small in this repo: a `TODO`/`FIXME` comment, a
one-line docs fix, or the shape of a recent small commit
(`git log --oneline -10`). Explain why a small task is the right first change to
onboard with. If nothing small is at hand, ask the user for one — do not
manufacture busywork.

## 3. Pick a light type

Steer toward `chore` or `docs` — three short artifacts, not the full `feat`
treatment — unless the task the user picked is genuinely a feature or fix.
Explain the tradeoff (lighter type, fewer artifacts, faster loop) before asking
the user to confirm the type.

## 4. Scaffold the change

```
cospec new <type> <slug>
```

Show the printed artifact plan and explain what each artifact is for. Pause:
confirm the user wants to continue before authoring anything.

## 5. Author each artifact, pausing between them

For each artifact in the plan, in order:

```
cospec instructions <artifact> --change <slug> --json
```

Explain what the instructions ask for, write the artifact, show the user what
you wrote, and pause before moving to the next artifact.

## 6. Validate

```
cospec validate <slug> --strict
```

Explain what this checks. Fix anything it flags, narrating the fix, then re-run
until clean.

## 7. Apply

```
cospec apply <slug> --json
```

Explain the exit code before acting on it: `0` clear (proceed to implement), `2`
blocked (a required artifact or a hard blocker — stop and explain which), `3`
soft-blocked (confirm with the user, then re-run with `--allow-soft`).

## 8. Implement and record evidence

Work through `tasks.md`, checking off each box as you finish it. If the type
plans a `verification.md`, fill in each row's observed result as you go rather
than leaving it for later. Pause after implementation to show the user the diff
before archiving.

## 9. Archive

```
cospec archive <slug>
```

Explain what just happened: the change validated, its spec deltas merged (or
were skipped), the move was verified on disk, and any blocker boxes fanned out
to sibling changes.

## 10. Wrap up

Tell the user they have now run the full cospec loop once end to end, and point
at `/cospec-propose` (or `/cospec-new` plus `/cospec-ff` or `/cospec-continue`)
for their next real change.
