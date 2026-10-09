# Verification

Every row that installs or uninstalls runs under a temporary `HOME` built by the
sandbox helper (task 5.1): `HOME`, `USERPROFILE`, `XDG_*`, `ZDOTDIR`,
`CODEX_HOME` and `PROFILE` under a fresh directory, `ZSH`, `ZSH_CUSTOM` and
`PSModulePath` removed. No row runs `install` or `uninstall` with the real home.

## 1. Install then uninstall round-trips for every shell [critical]

- [ ] 1.1 @integration (agent) `completion-install.test.ts`: `cospec completion install bash` then `uninstall bash -y` over a pre-existing `~/.bashrc` -> script at `~/.local/share/bash-completion/completions/cospec` after install and gone after uninstall, `~/.bashrc` byte-identical to the original, exit 0 both
- [ ] 1.2 @integration (agent) same for zsh over a pre-existing `~/.zshrc` -> `~/.zsh/completions/_cospec` installed then removed, the `# COSPEC:START` block at the top of `~/.zshrc` followed by one blank line, byte-identical `~/.zshrc` after uninstall
- [ ] 1.3 @integration (agent) same for fish -> `~/.config/fish/completions/cospec.fish` installed then removed, and no `~/.config/fish/config.fish` ever created
- [ ] 1.4 @integration (agent) same for PowerShell with `PROFILE` pointing into the temporary home, over a pre-existing profile -> `CospecCompletion.ps1` beside it, the block appended, profile byte-identical after uninstall
- [ ] 1.5 @integration (agent) zsh with `ZSH` set to a temporary Oh My Zsh root -> script under `$ZSH/custom/completions/_cospec`, no `~/.zshrc` created, the `fpath` guidance printed; with `~/.oh-my-zsh` a directory and `ZSH` unset, the same
- [ ] 1.6 @integration (agent) each shell with no pre-existing rc file -> the rc file holds only the bare block after install and no `COSPEC` marker after uninstall
- [x] 1.7 @unit (agent) `completion-install.test.ts` unit table: the five targets, block insertion points, replace-in-place and the exact-inverse removal -> completion-install.test.ts: the five targets, block insertion points, replace-in-place and `removeBlock(insertBlock(x)) === x` for eight originals at both placements pass

## 2. A second install changes nothing, and a changed script is backed up [critical]

- [ ] 2.1 @integration (agent) install zsh twice, snapshotting every file's bytes and mtime under `HOME` between -> second run prints `already installed (up to date)`, exit 0, no byte and no mtime changed, no `.backup-` file
- [ ] 2.2 @integration (agent) install, edit the installed script, install again with `--verbose` -> the script is regenerated, `<script>.backup-<timestamp>` holds the edited bytes, the verbose output prints `Backup created:` with that path, and the rc file was not backed up
- [ ] 2.3 @integration (agent) first install of each shell -> no `.backup-` file anywhere under `HOME`
- [ ] 2.4 @integration (agent) `--verbose` on a first install -> prints `Installed to:` with the script path and the rc file configured; without `--verbose` neither line prints; the reload command (`exec zsh`, `exec bash`, `exec fish`, `. $PROFILE`) prints in both

## 3. Everything cospec writes calls cospec [critical]

- [ ] 3.1 @integration (agent) after installing all four shells under one temporary home, search every file the install created or edited for the token `openspec` (case-insensitive) -> zero matches in the scripts and the rc blocks; every script contains `cospec`
- [ ] 3.2 @integration (agent) the installed zsh script is byte-identical to `cospec completion zsh` stdout, and likewise for bash, fish and PowerShell -> equal
- [x] 3.3 @unit (agent) installer unit tests: no written byte contains `openspec` for any shell, any home, any `PROFILE` -> completion-install.test.ts: every file the installer wrote for the four shells, its rc blocks and warnings, and the `OPENSPEC_NO_AUTO_CONFIG` manual lines contain no `openspec`

## 4. cospec's install and uninstall coexist with OpenSpec's

- [ ] 4.1 @integration (agent) in one temporary home, run the pinned binary's `completion install zsh` (sandboxed env, `OPENSPEC_NO_COMPLETIONS=1`), then `cospec completion install zsh`, then `cospec completion uninstall zsh -y` -> `_openspec` and the `# OPENSPEC:START` block are byte-identical to what the binary wrote; `_cospec` and the `COSPEC` block are gone
- [ ] 4.2 @integration (agent) the reverse order, then the binary's `completion uninstall zsh -y` -> cospec's `_cospec` and `COSPEC` block are untouched

## 5. Uninstall confirms before removing

- [ ] 5.1 @integration (agent) `uninstall zsh` with stdin not a terminal and no `-y` -> exit 1, stderr names `-y`, script and rc block still present
- [ ] 5.2 @e2e (agent) `uninstall zsh` through a pty, answering `n` -> prints `Uninstall cancelled.`, exit 0, nothing removed; answering `y` removes both (skipped where `script` is absent)
- [ ] 5.3 @integration (agent) `uninstall zsh -y` and `--yes` over an installed zsh -> removed, no prompt
- [ ] 5.4 @integration (agent) `uninstall zsh -y` under an empty home -> exit 1, `Completion script is not installed` on stderr
- [ ] 5.5 @integration (agent) delete the script by hand, then `uninstall zsh -y` -> the orphaned rc block is removed, exit 0, for zsh, bash and PowerShell

## 6. Wiring edge cases

- [ ] 6.1 @integration (agent) `OPENSPEC_NO_AUTO_CONFIG=1` install of zsh, bash and PowerShell -> script written, rc file not created or modified, the lines to add printed
- [ ] 6.2 @integration (agent) an rc file holding a `# COSPEC:START` with no end marker -> install writes the script, leaves the rc file byte-identical, reports the marker error on stderr with the manual lines, exit 0; uninstall exits 1
- [ ] 6.3 @integration (agent) a `$PROFILE` that is UTF-16 LE with a BOM -> install and uninstall leave it UTF-16 LE with a BOM and byte-identical afterward; a UTF-8 BOM profile likewise; a UTF-16 BE profile is not modified and the reason is reported
- [ ] 6.4 @integration (agent) a script path that cannot be written (the completions directory made read-only) -> `✗` on stderr, exit 1, rc file untouched (skipped where the process can write anyway, such as root)
- [x] 6.5 @unit (agent) the corresponding unit cases of task 2.1 -> completion-install.test.ts: no-auto-config, unwritable script dir (a file where `.zsh` belongs), unreadable rc, one-marker rc, the four PowerShell encodings and the OpenSpec-coexistence cases pass (66 cases)

## 7. Shell resolution, refusals and `--json`

- [ ] 7.1 @integration (agent) `completion install` with `SHELL=/bin/tcsh`, `completion uninstall -y` likewise, and `completion` likewise -> each exit 1 naming bash, zsh, fish and powershell and the explicit form of its own operation, nothing written
- [ ] 7.2 @integration (agent) `completion install` with `SHELL` unset and `PSModulePath` set -> installs PowerShell; `completion` there prints the PowerShell script
- [ ] 7.3 @integration (agent) `completion install ZSH` and `completion generate POWERSHELL` -> case-insensitive, as upstream
- [x] 7.4 @integration (agent) `completion install --json`, `completion uninstall --json` and `completion zsh --json` -> completion.test.ts: `install zsh --json` and `uninstall zsh --json` each print one `{command: completion, ok: false}` document, exit 1, empty stderr, and the dispatch unit test shows no `.zsh` created; `completion zsh --json` unchanged
- [x] 7.5 @integration (agent) `cospec completion --help` and `cospec completion install --help` -> completion.test.ts and cli.test.ts: `completion --help` lists `install`, `uninstall`, `--verbose` and `-y, --yes`, the usage names powershell, and `install --help` and `uninstall --help` print them; `completion install` is a handled row, no longer refused as pending

## 8. The PowerShell script is cospec's

- [ ] 8.1 @integration (agent) `cospec completion powershell` and `completion generate powershell` -> identical output that registers `Register-ArgumentCompleter -Native -CommandName cospec`, lists every non-hidden command, contains no `openspec`, and is ASCII only
- [x] 8.2 @unit (agent) the three-way parity test with PowerShell -> completions.test.ts parity rows read each row's PowerShell block (own flags equal the table's offered flags; globals per row; --store absent on init) and the parser rows accept every offered flag and refuse every pending one; powershell-completion.test.ts asserts no pending or hidden flag in any block
- [ ] 8.3 @integration (agent) `pwsh -NoProfile` parses the script and `TabExpansion2` completes a command, a flag and `completion <Tab>` -> pass where `pwsh` is on `PATH`; recorded as skipped where it is not (this machine has no `pwsh`)

## 9. The tip shows once on a terminal [critical]

- [ ] 9.1 @e2e (agent) run a command through a pty (`script`) with `CI` unset, a fresh config dir and `SHELL=/bin/zsh`, twice -> the first run prints a blank line then `Tip: Run 'cospec completion install' for shell completions` on stderr after the command's own output and writes `completionTipSeen: true`; the second prints nothing extra (skipped where `script` is absent)
- [x] 9.2 @unit (agent) `completion-tip.test.ts` with the TTY flag injected -> completion-tip.test.ts: 58 pass; shows once; the flag is written before the message; a write that fails leaves the tip unprinted, with no output and no config created
- [ ] 9.3 @integration (agent) the same pty run with the shell's script already installed, and with `SHELL=/bin/tcsh` -> no tip printed and `completionTipSeen` recorded in both

## 10. The tip never shows where nobody reads it [critical]

- [ ] 10.1 @integration (agent) pty runs with `--json`, `CI=true`, `OPENSPEC_NO_COMPLETIONS=1`, and as `completion zsh`, `__complete changes` and `help` -> no tip on stderr in any
- [ ] 10.2 @integration (agent) a plain run with stderr piped, fresh config dir -> no tip, and the config file is not created
- [ ] 10.3 @integration (agent) a deferred run (`--json`, then piped stderr) followed by a pty run -> the pty run prints the tip, so deferral did not consume it
- [ ] 10.4 @unit (agent) `CI` values `true`, `1`, `yes`, `on`, `True` suppress and `''`, `false`, `0`, `no`, `off` do not, and a suppressed run does not read the config -> pass
- [ ] 10.5 @integration (agent) a pty run of `--help`, an unknown command and a parse refusal -> no tip, config untouched
- [ ] 10.6 @integration (agent) every wrapped call (`cospec list`, `cospec schemas`) still spawns the binary with `OPENSPEC_NO_COMPLETIONS=1`, so the binary's own tip never prints through cospec -> stderr has no `Tip: Run 'openspec completion install'` line

## 11. The config write is safe

- [ ] 11.1 @integration (agent) a config holding `{"telemetry":{"anonymousId":"x"}}` and a pty run -> the file keeps `telemetry` and gains `completionTipSeen: true`, written as 2-space JSON with a trailing newline, mode `0o600`, no temporary file left behind
- [ ] 11.2 @integration (agent) a config whose root is an array, and one that is invalid JSON -> the file is byte-identical after a pty run and no tip prints
- [ ] 11.3 @integration (agent) `XDG_CONFIG_HOME` set -> the file is `<XDG_CONFIG_HOME>/openspec/config.json`, the path `cospec config path` reports
- [ ] 11.4 @unit (agent) the raw read stamps no `profile` or `delivery` default into a config that lacked them -> pass

## 12. The parity surface

- [ ] 12.1 @regression (agent) `grep -c 'completion-install' apps/cli/test/contract/parity-pending.yaml` before and after, then `mise run test:contract` -> 4 entries before, 0 after; reachability resolves `completion install`, `completion uninstall` and both `powershell` values through the table, and parity-close-out passes
- [x] 12.2 @unit (agent) `command-table.test.ts` with the four `completion` pending rows removed -> command-table.test.ts: EXPECTED_PENDING holds the four `init` rows only, the four completion rows and the `completion generate powershell` case are gone -> 77 pass

## 13. The tests never touch the real home

- [ ] 13.1 @unit (agent) the sandbox helper's guard with a `HOME` outside the temporary directory -> the helper throws before spawning
- [ ] 13.2 @integration (agent) snapshot the hash of the real `~/.zshrc`, `~/.bashrc`, `~/.config/fish`, `~/.config/powershell` and `~/.config/openspec/config.json` before and after `mise run test:integration` -> unchanged

## 14. Docs and shared guidance

- [ ] 14.1 @integration (agent) `mise run docs:build` -> exits 0
- [ ] 14.2 @integration (agent) search `apps/docs` for "no `install`/`uninstall`", "copy-paste only" and "is not supported yet`— there's no" -> no match;`installation.md`describes`install`, `uninstall`, `--verbose`, `-y`, the four shells, the targets, the `ZDOTDIR`limit,`OPENSPEC_NO_AUTO_CONFIG` and the tip's suppression rules
- [ ] 14.3 @integration (agent) `commands.md`'s `completion` row, its "Not supported yet" example and its `--json` sentence, `harness-setup.md`'s "no global state" sentence, `docs/harness-integration.md`, `README.md` and `configuration.md`'s `completionTipSeen` entry -> each read and consistent with the behaviour rows above
- [ ] 14.4 @integration (agent) `mise run agents:check` after `mise run agents:sync` -> exits 0, and `.agents/shared.md` names the installer, the tip and the home sandbox helper
- [ ] 14.5 @integration (agent) `mise run cospec -- validate --specs --strict` -> `cospec-shell-completion` and `upstream-command-spellings` valid with the Purpose paragraph edited

## 15. The full gate

- [ ] 15.1 @regression (agent) `mise run check` -> exits 0 (lint, format, typecheck, unit, contract, integration, bench unit, pack smoke, generate and agents drift, docs build)
