---
title: Installation
description:
  Install cospec via npm, pnpm, or bun, or as a standalone binary, then scaffold
  a project with cospec init.
---

# Installation

cospec ships as `@aligned-team/cospec` on npm, and as standalone platform
binaries on GitHub Releases for environments with no JS runtime at all. Either
way you get the same CLI.

## Package managers

::: code-group

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

## Standalone binary

Download the binary for your platform from the
[GitHub releases](https://github.com/aligned-team/cospec/releases) page. It is
fully self-contained — no JS runtime, no `node_modules`, no separate install
step. The binary embeds a pinned build of the OpenSpec CLI and runs it with its
own bundled runtime, so every wrapped command (`new`, `validate`, `apply`,
`archive`, …) works out of the box. Run `cospec doctor` to see which OpenSpec
build is actually in effect, including when it's the embedded one.

## Resolving OpenSpec

cospec never runs `openspec` off your `$PATH`. On every wrapped call it resolves
the real binary in order: first, a project dependency — if your project has
`@fission-ai/openspec` installed (any version in the accepted range), that copy
is used; otherwise it falls back to the pinned copy embedded in the cospec
binary itself. This means a project-level install always wins, letting you pin
your own OpenSpec version, while the standalone binary still works with zero
setup. See [How it relates to OpenSpec](/concepts/how-it-relates-to-openspec)
for the exact version pin and accepted range.

## Scaffolding a project

`cospec init` sets up a repo to use cospec:

- creates the `openspec/` directory structure
- materializes the eleven typed schemas cospec maps to conventional-commit types
- generates agent skills and commands for your coding agent's harness
- optionally scaffolds a commit gate (mise + hk + commitlint); when a
  `mise.toml` already exists, `cospec init` additively merges the gate's tasks
  and tool pins into it, leaving any conflicting values as-is with a paste-ready
  snippet

It's idempotent — running it again on an already-initialized project leaves a
clean tree unchanged.

By default, the gate is on for a fresh (state A) repo. Re-running `init` on an
existing repo (state B/C) resyncs an already-adopted gate — detected by a
`mise.toml` with a `cospec:*` task — without needing `--gate` again, so the gate
stays current as cospec's tasks evolve. A repo that never adopted the gate stays
opt-in: re-init prints a one-line hint instead of silently doing nothing —

```
Gate: no commit gate configured. Run 'cospec init --gate' to add it (merges into your mise.toml).
```

Pass `--gate`/`--no-gate` to override the default in either direction.

By default `cospec init` detects your harness, but you can target one or more
explicitly:

```sh
cospec init --harness claude,codex
```

See [Harness setup](/guide/harness-setup) for what each harness option generates
and how permissions are configured.
