Propose a new openspec change and drive it to apply-ready in one pass — every
artifact its type requires, and nothing its type forbids.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

`cospec` is self-describing — you do not need to explore the repo to learn what
to write. `cospec new` prints the exact artifact plan for the type, and
`cospec instructions <artifact> --change <slug> --json` prints the authoritative
template, per-type format, and project rules for each artifact. Trust that
output: do NOT read `openspec/schemas/`, `openspec/config.yaml`, or other repo
files to reverse-engineer an artifact's shape. Create the change first with
`cospec new`, then let the instructions drive each artifact; every wasted
exploration step is a turn you do not spend authoring.

## 1. Pick the type and slug

The argument after the command is either `<type>: <free text>` (for example
`feat: add a greeting endpoint`) or a bare description.

- If it begins with a known type followed by `:`, use that type.
- Otherwise ask the user to choose a type, offering this table:

{{TYPE_TABLE}}

Derive a kebab-case slug matching `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` from the
description, or ask the user for one.

## 2. Create the change

```
cospec new <type> <slug>
```

This writes `openspec/changes/<slug>/.openspec.yaml` (its `schema` is the type)
and prints the artifact plan — the exact set of artifacts you must write for
this type. That plan is authoritative; do not add artifacts the type forbids.

## 3. Build the artifacts in dependency order

Loop until every artifact in the type's `apply.requires` is written:

1. `cospec status --change <slug> --json` — read which artifacts are ready to
   write next (their dependencies are satisfied) and which are still waiting.
2. For each ready artifact, run
   `cospec instructions <artifact> --change <slug> --json`. The JSON carries the
   template, the type-specific instruction, and any project `context` and
   `rules`. Treat `context` and `rules` as constraints on how you write — never
   copy them into the artifact itself. Re-read every completed dependency
   artifact from disk before writing against it, even if you wrote it earlier in
   this session — the user may have edited it since.
3. Write the artifact at the path the instructions name, following the format
   exactly. `blocking-changes.md`, the `specs/**/spec.md` deltas, and
   `verification.md` are machine-parsed — small deviations fail validation.
4. Repeat.

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
`/cospec:apply` when they want to implement it. Do not start implementation
here.
