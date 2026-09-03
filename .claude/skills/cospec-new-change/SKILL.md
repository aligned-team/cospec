---
name: cospec-new-change
description: Scaffold a new change and show its typed artifact plan, then stop before authoring anything.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.5.4
  contentHash: sha256:c08b7e155630b8c71cb05eb637a65d957a7a5506d8f687f5d7e685eaaf94b475
---

Scaffold a new openspec change and stop. This workflow creates the change and
shows you its typed artifact plan — it does not author any artifact. Hand off to
`/cospec:ff` or `/cospec:continue` to actually write them.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

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
| feat | A new feature — the full workflow | proposal → blocking-changes, specs (+ design) → tasks |
| fix | A bug fix | proposal → blocking-changes (+ specs, design) → tasks |
| perf | A performance change with identical behavior | proposal (+ Benchmarks) → blocking-changes → tasks |
| refactor | A structure change with no behavior change | proposal → blocking-changes, design → tasks |
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

- `/cospec:ff` — author every remaining artifact in one pass.
- `/cospec:continue` — author one artifact at a time, reviewing each.

Do not create any artifact file yourself in this workflow.
