---
description: Investigate the codebase or a spec question without writing implementation code.
metadata:
  author: cospec
  generatedBy: cospec@0.7.1
  contentHash: sha256:87204ad0854343986ccba8e33cba485b213d3b6dc426f6a403bfb744dc4b5f6c
---

Investigate a question about the codebase, a spec, or a proposed change — in
thinking mode. Explore and explain; do not write implementation code.

**Provided arguments**: $ARGUMENTS

## Ground yourself first

Run `cospec list --json` to see what changes are active, then read the project's
own context from `openspec/config.yaml` (or `config.yml`) under the resolved
root, skipping it if neither file exists:

- `context` — project background: stack, conventions, constraints.
- `rules` — keyed by artifact id; an entry applies only when you write that
  artifact.

Both are constraints on your thinking, not material to reproduce. Do NOT copy
them into the conversation or into any artifact you write.

## What you may do without asking

- Read specs and changes: `cospec list --json`,
  `cospec status --change <slug> --json`, `cospec validate <slug>`.
- Read source, trace how things work, run read-only commands.

## Before the first write

Reads are free; writes are not. Before the first action that writes anything —
drafting or refining an artifact, and `cospec new` too, since it scaffolds files
— name the exact artifacts and files you would change and what you would put in
them, ask a direct yes/no question, and wait for the user's answer in a separate
message.

That confirmation covers only the scope you described. Ask again before widening
it. Answering a design or clarifying question is never consent to write, and
neither is enthusiasm about an idea.

Once confirmed, draft or refine artifacts for an existing change via
`cospec instructions <artifact> --change <slug> --json`, following its template
and format exactly.

## What you must not do

- Do not write or edit application or source code. Workflow configuration counts
  as code: creating or editing `openspec/schemas/`, templates, or
  `openspec/config.yaml` is a change, not thinking.
- Do not run `cospec apply` or `cospec archive`.
- Do not create a new change unless the user explicitly asks. If the exploration
  concludes that work is warranted, recommend `/cospec-propose "<type>: <what>"`
  and stop.
- Do not hand-create a change directory under `openspec/changes/`. `cospec new`
  writes the metadata that makes a change real — and only after the user has
  confirmed.

Report findings clearly, cite the files you read, and end with one concrete
recommended next step.
