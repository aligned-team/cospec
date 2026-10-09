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

## Via mise

```sh
mise use github:aligned-team/cospec
cospec init
```

This installs the self-contained binary via mise's `github` backend — no JS
runtime needed. The binary embeds a pinned build of the OpenSpec CLI and runs it
with its own bundled runtime, so every wrapped command (`new`, `validate`,
`apply`, `archive`, …) works out of the box.

> mise's github backend applies a default release-age cooldown
> (`minimum_release_age`) that hides very recent releases from "latest"
> resolution. If you're testing a release cut in the last day or so and it
> doesn't show up, pin the exact version instead:
> `mise use github:aligned-team/cospec@0.5.2` (a full `major.minor.patch`, not
> `@0.5`) — exact pins bypass the cooldown.

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

Valid values are `claude`, `codex`, `opencode`, `agents`, `all` (every target)
and `none`. `codex` and `agents` both write the shared `.agents/skills` root and
render byte-identical files there; `codex` adds `.codex/rules/cospec.rules` on
top.

See [Harness setup](/guide/harness-setup) for what each harness option generates
and how permissions are configured.

## Shell completion

`cospec completion [bash|zsh|fish|powershell]` prints a completion script to
stdout, generated natively from cospec's own command table. It never passes
through to OpenSpec's installer, which writes a function that shells out to bare
`openspec`. `cospec completion generate [shell]` is upstream's own spelling of
the same command and works identically.

`cospec completion install [shell]` writes that script to the shell's completion
directory and wires the shell to load it. `cospec completion uninstall [shell]`
removes both. Omit the shell argument and cospec detects it from `$SHELL`
(PowerShell is detected from `PSModulePath` when `$SHELL` is unset).

```sh
cospec completion install            # detect the shell, write the script, wire the rc file
cospec completion install zsh --verbose
cospec completion uninstall bash -y  # remove without the confirmation prompt
```

| Shell      | Script written to                                                 | Rc file edited                                                          |
| ---------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| zsh        | `~/.zsh/completions/_cospec`                                      | `~/.zshrc`: `fpath` and `compinit`                                      |
| zsh (OMZ)  | `$ZSH_CUSTOM/completions/_cospec` (default `~/.oh-my-zsh/custom`) | none, Oh My Zsh loads that directory                                    |
| bash       | `~/.local/share/bash-completion/completions/cospec`               | `~/.bashrc`: sources every file in that directory                       |
| fish       | `~/.config/fish/completions/cospec.fish`                          | none, fish autoloads that directory                                     |
| PowerShell | `CospecCompletion.ps1` beside your `$PROFILE`                     | `$PROFILE`: dot-sources the script, on every profile path Windows lists |

Oh My Zsh is detected the way upstream detects it: `$ZSH` is set, or
`~/.oh-my-zsh` is a directory.

What `install` does, and what `uninstall` undoes:

- The rc edit is one block bracketed by `# COSPEC:START` and `# COSPEC:END`.
  `uninstall` removes exactly that block, so the rc file is left as it was
  before `install`.
- When the script already exists with different bytes, `install` copies it to
  `<script>.backup-<timestamp>` before overwriting it. The rc file is not backed
  up. When both the script and the rc block are already current, `install`
  changes nothing. When the script is current but the rc block is gone,
  `install` writes the block back and says so.
- `install` ends with the command that reloads your shell (`exec zsh`,
  `exec bash`, `. $PROFILE`). Fish needs none: it loads the script as soon as it
  exists, and `install` says so.
- `uninstall` asks before it removes anything. Answer `y` or `yes` to remove;
  any other answer cancels. `-y` (`--yes`) skips the prompt. With no terminal
  and no `-y`, `uninstall` refuses and exits `1`, so a piped run never removes
  anything by accident.
- `--verbose` shows the detailed output, including the backup path when one is
  made.

Paths are derived from your home directory, not from `ZDOTDIR` or
`XDG_CONFIG_HOME`. A zsh that reads `$ZDOTDIR/.zshrc` does not read the
`~/.zshrc` that `install` edits, so for that setup add the same `fpath` and
`compinit` lines to `$ZDOTDIR/.zshrc` yourself, pointing at the script's
directory.

Set `OPENSPEC_NO_AUTO_CONFIG=1` to keep `install` from editing any rc file on
zsh, bash or PowerShell. It still writes the script and prints the lines to add
by hand. Fish is unaffected, since it never edits an rc file.

### The completion tip

On an interactive terminal, the first time you run a cospec command without a
completion script installed, cospec prints once, on stderr, after the command's
own output:

```txt
Tip: Run 'cospec completion install' for shell completions
```

The tip is recorded as `completionTipSeen: true` in the global config
(`openspec/config.json` under `$XDG_CONFIG_HOME`, else `%APPDATA%` on Windows,
else `~/.config`), so it never repeats, and OpenSpec reads the same flag. It is
not shown when:

- `CI` is set to anything other than `''`, `false`, `0`, `no` or `off`, or
  `OPENSPEC_NO_COMPLETIONS` is exactly `1`;
- the command is `--help`, `help`, `--json`, `completion`, a hidden command, or
  the hidden `__complete`;
- the run ended in a parse refusal (an unknown option, a missing value or
  argument, too many arguments, an unknown command), including one OpenSpec's
  parser raises for a command cospec forwards to it, such as
  `cospec schemas --bogus`;
- stderr is not a terminal (the tip waits for a run a person will read);
- your shell is undetected or unsupported, or its completion script is already
  installed.

Omit the shell argument and cospec detects it from `$SHELL`. Completion covers
every command and flag cospec declares, plus dynamic suggestions for change
slugs, spec ids, and the eleven conventional-commit types, sourced from a hidden
`cospec __complete` call at Tab time.
