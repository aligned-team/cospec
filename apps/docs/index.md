---
title: cospec
description:
  OpenSpec change management, sized to your conventional-commit type — feat gets
  the full treatment, ci takes two minutes.
layout: home

hero:
  name: cospec
  text: Spec-driven workflow, sized to your commit type
  tagline:
    feat gets the full treatment — proposal, blocking-changes, specs,
    verification, tasks. ci, chore, and docs take two minutes with three short
    artifacts.
  actions:
    - theme: brand
      text: Get started
      link: /guide/installation
    - theme: alt
      text: See the workflow
      link: /guide/workflow
    - theme: alt
      text: GitHub
      link: https://github.com/aligned-team/cospec

features:
  - title: Sized to the change
    details:
      Eleven typed schemas, one per conventional-commit type. feat requires
      proposal, blocking-changes, specs, verification, and tasks; docs and chore
      need three short artifacts. No generic one-size-fits-all workflow.
  - title: A gate agents can't rationalize past
    details:
      cospec apply is a deterministic blocker gate with an exit code, not a
      suggestion — 0 clear, 2 blocked, 3 soft-blocked. The rule lives in schema
      prose too, so there's nothing to argue around.
  - title: Archive that verifies itself
    details:
      cospec archive checks the directory actually moved on disk instead of
      trusting OpenSpec's exit code, which can report 0 even after aborting.
  - title: An enforced verification ledger
    details:
      A machine-parsed acceptance-evidence artifact that archive hard-gates on —
      every critical behavior needs recorded evidence, and unfinished rows block
      the move.
  - title: Wraps real OpenSpec, never replaces it
    details:
      cospec spawns the actual pinned OpenSpec binary by resolved path and adds
      validation, gating, and verification on top — it never forks or
      reimplements OpenSpec's core.
  - title: Agent-native harness setup
    details:
      cospec init --harness generates ready-to-run skills and commands for
      Claude Code, Codex, OpenCode, and the shared .agents/skills root, with the
      permissions each harness needs pre-wired.
---

## Quickstart

::: code-group

```sh [mise]
mise use github:aligned-team/cospec
cospec init
```

```sh [npm]
npm i -D @aligned-team/cospec
npx cospec init
```

```sh [pnpm]
pnpm add -D @aligned-team/cospec
pnpm cospec init
```

```sh [bun]
bun add -d @aligned-team/cospec
bun run cospec init
```

:::

`cospec init` scaffolds `openspec/`, materializes the eleven typed schemas, and
generates agent skills for your harness. It's idempotent — run it again and a
clean tree stays clean.

Once installed, the loop is the same for every change, only the artifact list
changes:

```sh
cospec new feat add-widget      # pick the type; cospec prints the artifact plan
cospec validate add-widget --strict
cospec apply add-widget         # the gate — exit 0 clear, 2 blocked, 3 soft-blocked
# implement, checking off tasks.md as you go
cospec archive add-widget       # validates, gates, archives, verifies the move
```

See the full walkthrough, including how to author each artifact, in
[The workflow](/guide/workflow).

## Types, simplified

Every type gets a proposal and tasks; the rest scales with how much the change
touches. This is the simplified view — schemas also mark artifacts `opt`
(optional, sometimes trigger-promoted) as well as required and forbidden. For
the full matrix, per-type rationale, and how the `## Surfaces` trigger works,
see [Commit types & the artifact matrix](/concepts/types-and-artifacts).

| type       | specs | verification | design | what it's for                         |
| ---------- | ----- | ------------ | ------ | ------------------------------------- |
| `feat`     | ✅    | ✅           | –      | a new feature — the full workflow     |
| `fix`      | –     | ✅           | –      | a bug fix                             |
| `perf`     | –     | ✅           | –      | performance, behavior unchanged       |
| `refactor` | –     | ✅           | ✅     | restructure, behavior unchanged       |
| `revert`   | –     | –            | ✗      | roll back a shipped change            |
| `build`    | ✗     | –            | ✗      | build config, dependencies, lockfiles |
| `ci`       | ✗     | –            | ✗      | CI workflows and automation           |
| `chore`    | ✗     | ✗            | ✗      | maintenance                           |
| `docs`     | ✗     | ✗            | ✗      | documentation                         |
| `style`    | ✗     | ✗            | ✗      | formatting, no semantic change        |
| `test`     | ✗     | ✗            | ✗      | tests for already-specified behavior  |

✅ required · – optional · ✗ forbidden (`cospec validate` errors if present).
