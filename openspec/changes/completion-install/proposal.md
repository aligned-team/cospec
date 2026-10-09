# Proposal

## Why

`cospec completion` prints a script and stops. A user who wants completions
copies a per-shell one-liner out of the docs, and nothing tells a user who never
read the docs that completions exist. OpenSpec's own `completion install` and
`completion uninstall` wire a shell up in one command, add PowerShell, and show
a one-shot tip on first run. cospec is a drop-in replacement for it, so each of
those is a gap the reachability test already tracks as pending (rows 54-56 of
the roadmap).

cospec cannot relay OpenSpec's installer. It writes a completion function for
the bare `openspec` binary into the user's dotfiles, which is the line this
repo's routing discipline forbids. So cospec ports the installers natively over
the scripts its own generator already renders. What lands in the rc file and the
completions directory then calls `cospec`, and the install and the uninstall are
safe to run beside an OpenSpec install on the same machine.

## What Changes

- `cospec completion install [shell] [--verbose]` writes the generated script to
  the shell's completions location, wires the shell's rc file (`~/.zshrc`,
  `~/.bashrc`, `$PROFILE`; fish autoloads, so it needs no rc edit), and reports
  the reload command. `--verbose` adds the installed and backup paths. A second
  install changes nothing when both the script and the rc block are already
  current; if the block is gone it is written back and reported. An install over
  a changed script writes a timestamped backup first, as upstream's does.
- `cospec completion uninstall [shell] [-y]` removes the script and the rc
  block, confirming first unless `-y` is given.
- `completion [powershell]` and `completion generate powershell` print a
  PowerShell completion script, rendered from the same command table as the
  other three shells, and `install` and `uninstall` accept `powershell`.
- A one-shot tip, `Tip: Run 'cospec completion install' for shell completions`,
  prints once on stderr after a command's own output, under upstream's
  suppression rules, and records upstream's `completionTipSeen` key in the
  machine-global config.
- The install and uninstall name their files and rc markers `cospec`, never
  `openspec`: `_cospec`, `cospec`, `cospec.fish`, `CospecCompletion.ps1`, and
  `# COSPEC:START` / `# COSPEC:END`. cospec's install and uninstall never read,
  replace or remove OpenSpec's own.
- **BREAKING:** `completion.ts`'s "Generate-only by design" header, and the rule
  behind it that cospec writes nothing into a user's dotfiles, go. The commands
  that write are `install` and `uninstall` only; `completion [shell]` and
  `completion generate [shell]` still write nothing.
- **BREAKING:** cospec now writes under the user's home directory. `install`
  writes the completions directory and the rc file, and the first interactive
  run writes `completionTipSeen` into `<config dir>/openspec/config.json`. The
  docs' "no global state under your home directory" sentence changes with it.
- **BREAKING:** the `[completion, install]`, `[completion, uninstall]` and
  `powershell` pending entries leave `parity-pending.yaml`, and
  `cospec completion install` stops answering `'install' is not supported yet`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cospec-shell-completion`: gains PowerShell, `install`, `uninstall` and the
  one-shot tip. Its first requirement no longer says the command writes nothing
  for every spelling, and its shell-resolution requirement lists four shells.
- `upstream-command-spellings`: `completion generate` has no pending shell left,
  so `completion generate powershell` prints the script.

## Impact

- `apps/cli/src/commands/completion.ts` (`install`/`uninstall` subcommands, the
  shell list, the header), `apps/cli/src/core/completions/powershell.ts` (new),
  `apps/cli/src/core/completions/spec.ts` (flag descriptions for PowerShell's
  tooltips), `apps/cli/src/core/completions/install.ts` (new, the per-shell
  targets, rc blocks and backups), `apps/cli/src/core/completion-tip.ts` (new)
  and its call in `apps/cli/src/cli.ts`.
- `apps/cli/src/core/command-table.ts`: the `install` and `uninstall` rows stop
  being pending, with `--verbose` and `-y`/`--yes`; `powershell` joins the shell
  values; `apps/cli/test/contract/parity-pending.yaml` loses its four
  `completion-install` entries.
- Tests: `apps/cli/test/integration/completion-install.test.ts` (new), a
  home-sandbox helper in `apps/cli/test/fixtures/support.ts`, and unit tests for
  the generator, the installer and the tip. Every one that installs runs under a
  temporary `HOME`.
- Docs: `apps/docs/guide/installation.md`, `apps/docs/reference/commands.md`,
  `apps/docs/guide/harness-setup.md`, and the page that owns the global config
  keys. `.agents/shared.md` and `AGENTS.md`/`CLAUDE.md` through
  `mise run agents:sync`.
- The wrapped binary is untouched. Every spawn of it still forces
  `OPENSPEC_NO_COMPLETIONS=1`, so cospec's own tip is the only completions tip a
  user sees.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
