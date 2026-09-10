---
title: Verification
description: The acceptance-evidence ledger that archive hard-gates on — row grammar, layer vocabulary, and per-type requirements.
---

# Verification

`verification.md` closes the "green CI, broken behavior" gap. It's a
per-behavior acceptance-evidence ledger: every observable behavior gets a
group, and every row names the **layer** it must be exercised at, **who**
runs it, and the **evidence** that was actually recorded — not just a task
that was checked off.

## Planned before implementation

For the types that require it, you write `verification.md` during propose,
before any code exists — `cospec instructions verification` prints the
authoring instructions. The ledger is a plan for how you'll prove the change
works, not a retroactive test report. You fill in the `-> <result>` evidence
as you implement, in step with `tasks.md`.

## Row grammar

`verification.md` reuses the same checkbox lexer as `tasks.md`
(`## N. Group` / `- [ ] N.M …`) rather than introducing YAML frontmatter:

```
## 1. <behavior description> [critical]
- [ ] 1.1 @e2e (agent) drive the real flow end to end -> <expected/observed>
- [~] 1.2 @manual (human) exercise the interactive surface -> defer: <reason>
```

- **Group** — `## N. <text>` names one observable behavior. An optional
  trailing `[critical]` marks a behavior whose breakage ships a broken
  product.
- **Row state** — `[ ]` planned, `[x]` verified with evidence, `[~]`
  deferred (must carry `defer: <reason>`).
- **`@<layer>`** — a closed vocabulary: `@unit @integration @e2e @manual
@runtime @regression @equivalence @benchmark @eval`. Projects can extend it
  via `openspec/config.yaml` (`verification.layers`); an unrecognized token
  fails closed.
- **`(<owner>)`** — optional, `(agent)` or `(human)`. Defaults: `@manual`
  implies `(human)`, everything else implies `(agent)`. A `(human)`/`@manual`
  row is flagged in reports as CI-uncatchable — something no pipeline can
  confirm for you.
- **`-> <result>`** — required on every row. A checked (`[x]`) row's result
  must be non-empty: that's what makes "evidence recorded before archive"
  mechanical rather than a matter of trust.

As you implement, mark each row `[x]` with the observed result after `->`,
or `[~] defer: <reason>` for a row you deliberately won't run.

## Per-type required rows

Each type that requires `verification` layers on a distinct required-row
fact, checked at validate time:

| type       | required-row fact                                       |
| ---------- | ------------------------------------------------------- |
| `feat`     | every `[critical]` group needs a non-`@unit` row        |
| `fix`      | needs an `@regression` row                              |
| `perf`     | needs both a `@benchmark` row and an `@equivalence` row |
| `refactor` | needs an `@equivalence` row                             |

`refactor`'s `@equivalence` row is also where its `design.md` invariant
section earns its evidence — the plan and the proof live in different
artifacts, linked by that layer tag.

The full artifact matrix — which types require, optionally declare, or
forbid `verification` entirely — is owned by
[/concepts/types-and-artifacts](/concepts/types-and-artifacts). The exact
rule IDs behind every check above (`verification/layer-unknown`,
`verification/evidence-required`, and the rest) are catalogued at
[/reference/validation-rules](/reference/validation-rules).

## How archive gates on it

`cospec archive` hard-gates on this ledger via `archive/verification-incomplete`,
with no `--force`: whenever `verification` is required for the change's type,
**every row** — not only rows in `[critical]` groups — must resolve to `[x]`
with a recorded result, or `[~] defer: <reason>`. A single bare `[ ]` row
blocks the archive outright.

`archive/scenario-preservation` is a separate gate and does not read this
ledger at all — it compares a specs-bearing change's delta scenarios against
the living spec's scenario names and counts. See
[/concepts/apply-and-archive](/concepts/apply-and-archive), the canonical
owner of both gates' mechanics, for the full detail — including how
`verification` fits into `apply.requires` and what each exit code means.
