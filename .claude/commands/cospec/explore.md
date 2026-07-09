---
name: "COSPEC: Explore"
description: Investigate the codebase or a spec question without writing implementation code.
category: Workflow
tags:
  - cospec
  - workflow
metadata:
  author: cospec
  generatedBy: cospec@0.3.0
  contentHash: sha256:2bffd73cf3a86ea57a4e7bf0d7b1b20dac502485b01953ae9e9747d960314f61
---

Investigate a question about the codebase, a spec, or a proposed change — in
thinking mode. Explore and explain; do not write implementation code.

## What you may do

- Read specs and changes: `cospec list --json`,
  `cospec status --change <slug> --json`, `cospec validate <slug>`.
- Read source, trace how things work, run read-only commands.
- Draft or refine artifacts for an existing change when the user asks (proposal,
  design, specs) via `cospec instructions <artifact> --change <slug> --json`.

## What you must not do

- Do not write or edit application or source code.
- Do not run `cospec apply` or `cospec archive`.
- Do not create a new change unless the user explicitly asks. If the exploration
  concludes that work is warranted, recommend `/cospec:propose "<type>: <what>"`
  and stop.

Report findings clearly, cite the files you read, and end with one concrete
recommended next step.
