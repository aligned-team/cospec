Fast-forward an already-scaffolded change: author every remaining artifact in
one pass, then validate. Use this after `[[opsx:if-workflow new]]/cospec:new[[opsx:else]]cospec new <type> <slug>[[opsx:end]]` has already created the
change. Do NOT scaffold a new change here — if none exists yet, stop and point
the user at `[[opsx:if-workflow new]]/cospec:new[[opsx:else]]cospec new <type> <slug>[[opsx:end]]` instead.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

`cospec` is self-describing about format — you do not need to explore the repo to
learn how an artifact is shaped. `cospec instructions <artifact> --change <slug>
--json` prints the authoritative template, per-type format, and project rules for
each artifact. Trust that output for format: do NOT read `openspec/schemas/`,
`openspec/config.yaml`, or other repo files to reverse-engineer an artifact's
shape. That rule is about format, not subject matter: step 3 inspects the project
the change is about before you draft.

{{ROOT_GUARD}}

## 1. Pick the change

```
cospec list --json
```

If the user named a change, use it. If exactly one active change exists, use it
and announce `Using change: <slug>`. When several active changes exist, choose as
**Choosing a change** above says.

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
`[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]` when they want to implement it. Do not start implementation
here.
