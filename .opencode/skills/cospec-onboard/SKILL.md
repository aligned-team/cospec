---
name: cospec-onboard
description: Walk a first-time user through one real cospec change end to end, narrating each step.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.5.0
  contentHash: sha256:1c6874a1abb688f0e7dc04816ab881a811f3097d1ec25af822c8d322e0d42c76
---

Walk a first-time user through one real cospec change, end to end, narrating
each step before running it. This is a tutorial: explain, then do, then show the
result, then pause for the user before continuing. Stop gracefully at any point
the user wants to.

All work goes through `cospec`. Never call `openspec` directly.

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
