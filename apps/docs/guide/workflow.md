---
title: The workflow
description:
  The five-step loop every cospec change follows, from `new` through `archive`,
  worked through one example slug.
---

# The workflow

Every cospec change — regardless of type — moves through the same five steps:
**new → propose → apply → implement → archive**. The type you pick at `new`
decides how heavy steps 2 and 4 are (see
[Types and artifacts](/concepts/types-and-artifacts) for the full matrix), but
the loop itself never changes. This page walks the loop end to end with one
worked example: adding a widget, slug `add-widget`, type `feat`.

Every step below also accepts `--store <id>` to run against a registered
OpenSpec store instead of the local repo — see [Stores](/concepts/stores).

## 1. new

```sh
cospec new feat add-widget
```

This picks the type and scaffolds the change's `.openspec.yaml`. cospec prints
the artifact plan for `feat` right away — proposal, blocking-changes, specs,
verification, and tasks are all required — so you know the shape of the work
before you write anything.

## 2. propose

Author each required artifact with `cospec instructions <artifact>`:

```sh
cospec instructions proposal --change add-widget
cospec instructions specs --change add-widget
cospec instructions verification --change add-widget
cospec instructions tasks --change add-widget
```

For `feat`, `fix`, `perf`, and `refactor`, `cospec instructions verification`
matters most here: it plans the acceptance-evidence ledger — what you'll
demonstrate and how — _before_ you touch the implementation. See
[Verification](/concepts/verification) for the row grammar you'll fill in during
step 4.

Once every artifact is written, validate:

```sh
cospec validate add-widget --strict
```

`--strict` promotes warnings to errors — fix everything it flags before moving
on.

## 3. apply

```sh
cospec apply add-widget
```

This is the gate. It's deterministic, and its exit code is not a suggestion:

- **0** — clear. Start working the tasks.
- **2** — blocked. Stop, and report the blockers named in the output.
- **3** — soft-blocked. Confirm with whoever's asking, then re-run with
  `--allow-soft`.

Never infer the gate's state from reading files yourself — always run
`cospec apply` and act on what it returns. The full exit-code table (including
the codes shared with `archive`) lives on
[Apply and archive](/concepts/apply-and-archive).

## 4. implement

Work through `tasks.md`, checking off each task as you finish it. In parallel,
fill in the verification ledger you planned in step 2:

- `[x] <behavior> -> <observed result>` for anything you ran and confirmed
- `[~] defer: <reason>` for a row you're deliberately not running now

Both forms are machine-parsed, and `archive` will hold you to them — see
[Verification](/concepts/verification) for what counts as a valid row.

## 5. archive

```sh
cospec archive add-widget
```

`archive` is the verified ship step. It re-validates the change, gates on any
unchecked task, and enforces two hard verification gates —
`archive/verification-incomplete` and `archive/scenario-preservation` — that
cannot be bypassed with `--force`. If those pass, it delegates to OpenSpec's own
archive, then verifies on disk that the change directory actually moved and, for
schemas with a specs artifact, that the spec deltas landed correctly. Finally it
fans out: any other change whose blocking-changes ledger names `add-widget` gets
that entry checked off automatically.

::: tip Nothing to hand-verify Because `archive` checks the filesystem itself
rather than trusting a clean exit code, a successful run means the move
genuinely happened — not just that the underlying tool claimed it did. :::

### Optional: verify before archive

Before running `archive`, you can dress-rehearse it with `/cospec:verify` (or
`cospec validate <slug> --strict` plus a manual ledger walk): it re-validates
strictly, checks every verification row for a real observed result, confirms
`tasks.md` is fully checked, and names the two hard gates `archive` will enforce
— all without moving anything. See [Harness setup](/guide/harness-setup) for the
full command inventory.

### Entry-point variants

Steps 1–2 above (`new` then `propose`'s author loop) can also be driven as
`/cospec:new` (scaffold and stop) followed by `/cospec:ff` (author every
remaining artifact in one pass) or `/cospec:continue` (author one artifact at a
time) — same artifacts, same gate, different pacing. See
[Harness setup](/guide/harness-setup) for the full list of generated commands.

## The whole loop, start to finish

```sh
cospec new feat add-widget
# author artifacts with `cospec instructions <artifact> --change add-widget`
cospec validate add-widget --strict
cospec apply add-widget           # obey the exit code
# implement; check off tasks.md; record verification evidence
cospec archive add-widget         # validates, gates, verifies, fans out
```

That's the whole contract. Every cospec type runs this same five-step loop —
only the artifact list in step 2 and the gates in step 4 scale with how heavy
the type is.
