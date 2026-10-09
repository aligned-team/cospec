Scaffold a new openspec change and stop. This workflow creates the change and
shows you its typed artifact plan — it does not author any artifact. Hand off to
`[[opsx:if-workflow ff]]/cospec:ff[[opsx:else]]cospec instructions <artifact> --change <slug>[[opsx:end]]` or `[[opsx:if-workflow continue]]/cospec:continue[[opsx:else]]cospec instructions <artifact> --change <slug>[[opsx:end]]` to actually write them.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

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

- [[opsx:if-workflow ff]]`/cospec:ff` — author every remaining artifact in one pass.[[opsx:else]]`cospec instructions <artifact> --change <slug>` for each remaining artifact, in turn.[[opsx:end]]
- [[opsx:if-workflow continue]]`/cospec:continue` — author one artifact at a time, reviewing each.[[opsx:else]]`cospec instructions <artifact> --change <slug>` — author one artifact at a time, reviewing each.[[opsx:end]]

Do not create any artifact file yourself in this workflow.
