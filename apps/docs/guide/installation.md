---
title: Installation
description:
  Install cospec with the install script, mise, Nix, npm, pnpm, or bun, or as a
  standalone binary, then scaffold a project with cospec init.
---

# Installation

cospec ships as `@aligned-team/cospec` on npm, and as standalone platform
binaries on GitHub Releases for environments with no JS runtime at all. Either
way you get the same CLI.

## Supported platforms

Every release publishes one standalone binary per platform. The install script,
mise, Nix and the npm launcher all pick from the same set:

| OS      | x64                 | arm64                 |
| ------- | ------------------- | --------------------- |
| macOS   | `macos-x64`         | `macos-arm64`         |
| Linux   | `linux-x64` (glibc) | `linux-arm64` (glibc) |
| Linux   | `linux-x64-musl`    | `linux-arm64-musl`    |
| Windows | `windows-x64`       | `windows-arm64`       |

The glibc and musl builds are not interchangeable: a glibc binary does not run
on Alpine, and the musl binary does not run on Debian or Ubuntu. The musl build
also links `libstdc++` and `libgcc` dynamically, so on a stock Alpine image
install them first with `apk add libstdc++ libgcc`.

Each release's assets are named `cospec-<version>-<platform>.tar.gz` (`.zip` on
Windows), with the binary at the archive root, and a `SHA256SUMS` file lists the
SHA-256 of every archive and of both install scripts.

## Install script

The install scripts download the binary for your OS, architecture and libc from
a GitHub release, check it against that release's `SHA256SUMS`, and install it.
If the checksum does not match, they stop before writing anything, and an
existing `cospec` is left as it was. Neither script uses `sudo` or needs
administrator rights.

::: code-group

```sh [macOS / Linux]
curl -fsSL https://github.com/aligned-team/cospec/releases/latest/download/install.sh | sh
```

```powershell [Windows]
irm https://github.com/aligned-team/cospec/releases/latest/download/install.ps1 | iex
```

:::

| Variable                | Effect                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `COSPEC_VERSION`        | Install this release (for example `0.12.0`) instead of the latest; `latest` or unset means the latest.                                |
| `COSPEC_INSTALL_DIR`    | Install directory. Default `~/.local/bin` (macOS, Linux) or `%LOCALAPPDATA%\cospec\bin` (Windows).                                    |
| `COSPEC_RELEASE_BASE`   | Release root to download from, for a mirror. A local directory laid out like the GitHub release (`download/v<version>/…`) also works. |
| `COSPEC_NO_MODIFY_PATH` | Windows only. Set to `1` to keep `install.ps1` from adding the install directory to your user `PATH`.                                 |

`install.sh` never edits your shell profile. If the install directory is not on
your `PATH`, it says so and you add it yourself. `install.ps1` adds the
directory to your user `PATH` unless `COSPEC_NO_MODIFY_PATH=1`; open a new
terminal to pick it up.

`install.sh` is POSIX `sh` and needs `curl` or `wget`, `tar`, and `sha256sum` or
`shasum`. `install.ps1` runs on Windows PowerShell 5.1 and PowerShell 7. On
Apple silicon, a shell running under Rosetta still gets the native arm64 binary,
and on Windows on Arm an emulated x64 PowerShell still gets the arm64 one.

To read the script before running it, download it, inspect it, then run it:

```sh
curl -fsSLO https://github.com/aligned-team/cospec/releases/latest/download/install.sh
less install.sh
COSPEC_VERSION=0.12.0 sh install.sh
```

The `SHA256SUMS` of the same release lists `install.sh` and `install.ps1` too,
so you can check the script itself with `sha256sum --check --ignore-missing`.

## Via Nix

The repository is a Nix flake that wraps the release binaries. It exposes
`packages.default` and `overlays.default` for `x86_64-linux`, `aarch64-linux`,
`x86_64-darwin` and `aarch64-darwin`:

```sh
nix run github:aligned-team/cospec -- --version
nix profile install github:aligned-team/cospec
```

In your own flake, apply the overlay to get `pkgs.cospec`:

```nix
{
  inputs.cospec.url = "github:aligned-team/cospec";

  outputs = { nixpkgs, cospec, ... }: {
    nixosConfigurations.example = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        (
          { pkgs, ... }:
          {
            nixpkgs.overlays = [ cospec.overlays.default ];
            environment.systemPackages = [ pkgs.cospec ];
          }
        )
      ];
    };
  };
}
```

The flake fetches the release archive with the SHA-256 published in that
release's `SHA256SUMS`, so it never builds from source. On Linux it patches the
glibc binary to use the Nix store's loader. The flake on `main` always wraps the
latest release: the release workflow pins it in a follow-up commit,
`chore(release): pin the nix flake to v<version>`, once that release is live. To
stay on one release, lock your input to that commit
(`github:aligned-team/cospec/<commit>`). A release tag does not carry its own
pin, because the archive hashes only exist after the tag is cut.

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

Download the archive for your platform from the
[GitHub releases](https://github.com/aligned-team/cospec/releases) page and put
the `cospec` binary on your `PATH`; the [install script](#install-script) does
the same and checks the archive's checksum for you. The binary is fully
self-contained — no JS runtime, no `node_modules`, no separate install step. The
binary embeds a pinned build of the OpenSpec CLI and runs it with its own
bundled runtime, so every wrapped command (`new`, `validate`, `apply`,
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
