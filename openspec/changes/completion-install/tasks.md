# Tasks

## 1. T2: PowerShell generator

- [x] 1.1 Write the failing unit tests first in
      `apps/cli/test/unit/core/completions.test.ts` (and a new
      `powershell-completion.test.ts` beside it): `renderPowerShellCompletion`
      registers `Register-ArgumentCompleter -Native -CommandName cospec`, lists
      every non-hidden command and no hidden one, offers each command's flags as
      the table's offered flags (the three-way parity test gains PowerShell),
      contains no `openspec`, is ASCII only, single-quotes every string, and
      parses under `pwsh -NoProfile` when `pwsh` is on `PATH` (skipped
      otherwise). Verify they fail with `mise run test`.
- [x] 1.2 Extend `apps/cli/src/core/completions/spec.ts`: each flag's
      description (tooltip text) and each command's subcommands with their
      offered flags and its positional's closed value set, all read from the
      same table rows through `offeredFlags` so a pending flag stays absent.
      Verify the existing bash/zsh/fish scripts are byte-identical (their unit
      tests and goldens pass unchanged).
- [x] 1.3 Add `apps/cli/src/core/completions/powershell.ts`
      (`renderPowerShellCompletion`), completing commands, subcommands, flags,
      shell values and the dynamic sources through `cospec __complete`; verify
      the 1.1 tests pass.

## 2. T3: the installer

- [x] 2.1 Write the failing unit tests first in
      `apps/cli/test/unit/core/completion-install.test.ts`, each taking a
      temporary home and an environment object, never process state: the five
      targets (zsh, Oh My Zsh through `ZSH` and through `~/.oh-my-zsh`,
      `ZSH_CUSTOM`, bash, fish, PowerShell through `PROFILE` and the platform
      defaults); a block inserted at the top of a zsh or bash rc file, appended
      to a profile, created bare in a missing file, replaced in place; install
      then uninstall restoring every rc file byte for byte; an orphaned block
      removed without its script; a one-marker file refused; a second install
      changing no byte and no mtime; a changed script backed up with the
      `.backup-<ISO>` name and an identical one not;
      `OPENSPEC_NO_AUTO_CONFIG=1`; an unwritable target reported without
      touching the rc file; the PowerShell encodings (UTF-8, UTF-8 BOM, UTF-16
      LE BOM round trip, UTF-16 BE refused); no written byte contains
      `openspec`. Verify they fail.
- [x] 2.2 Add `apps/cli/src/core/completions/install.ts`: one table of per-shell
      targets and rc wiring (not four classes), the marker insert and its exact
      inverse, the backup rule, the profile encoding handling, and
      `isCompletionInstalled(shell, env, home)`; verify the 2.1 tests pass.

## 3. T1: the commands

- [x] 3.1 Write the failing tests first: unit tests for the shell resolver
      (explicit argument case-insensitive, `$SHELL` with a login dash,
      `PSModulePath` when `$SHELL` is unset, `tcsh` refused naming all four
      shells, per operation) and for the install/uninstall output (messages,
      `--verbose` lines, the reload command per shell, `Uninstall cancelled.`,
      the non-terminal refusal naming `-y`). Verify they fail.
- [x] 3.2 Edit `apps/cli/src/core/command-table.ts`: the `install` and
      `uninstall` rows stop being `pendingSub` and gain `--verbose` and
      `-y, --yes`; `powershell` joins `values` on both shell positionals and
      `pendingValues` goes; rewrite the row's `notes` line. Verify
      `cospec     completion --help` and `cospec completion install --help` list
      them and `mise run test:contract` reachability still passes after 3.4.
- [x] 3.3 Edit `apps/cli/src/commands/completion.ts`: replace the "Generate-only
      by design" header, add `powershell` to `SUPPORTED_SHELLS`, extend
      `detectShell` with the `PSModulePath` fallback, add one shared resolver
      for `generate`, `install` and `uninstall`, and add the `install` and
      `uninstall` subcommands over `renderCompletion()` and `install.ts`, with a
      native `y/N` prompt, no spinner and no `console.debug`. Verify the 3.1
      tests pass and `cospec completion install --json` prints one refusal
      document.
- [x] 3.4 Remove the `[completion, install]`, `[completion, uninstall]` and the
      two `powershell` `positional-value` entries (`completion` index 0 and
      `completion generate` index 0) from
      `apps/cli/test/contract/parity-pending.yaml`, the `completion-install`
      block's header with them. The `--verbose` and `-y` flags have no entry of
      their own; they are covered by the two command entries and are now table
      flags. Drop the four `completion` rows from `EXPECTED_PENDING`, their
      `argvFor` argv and the `completion generate powershell` refusal case in
      `apps/cli/test/unit/core/command-table.test.ts`, and change the
      `powershell is refused as not supported yet` test in
      `apps/cli/test/integration/completion.test.ts` to assert the script. Fix
      the stale "docs' copy-paste one-liner" comment in
      `apps/cli/src/core/completions/bash.ts`. Verify `mise run test:contract`
      passes with the reachability walk resolving all four through the table,
      and that `completion install` no longer answers
      `'install' is not supported yet`.

## 4. T4: the one-shot tip

- [x] 4.1 Write the failing unit tests first in
      `apps/cli/test/unit/core/completion-tip.test.ts`, with the TTY flag, the
      environment, the config dir and the installed check injected: each
      suppression rule (`CI` values `true`, `1`, `yes`, `on`, `True` suppress;
      `''`, `false`, `0`, `no`, `off` do not; `OPENSPEC_NO_COMPLETIONS=1`),
      defer-not-consume for `--json`, `completion`, `__complete`, `help`, a
      hidden row and a non-TTY stderr (config untouched), the raw read (no
      defaults stamped, other keys kept), an array or invalid-JSON config left
      alone, the flag recorded before the message, an atomic `0o600` write, a
      failed write leaving the tip unprinted, and the silent retire on an
      undetected shell or an installed script. Verify they fail.
- [x] 4.2 Add `apps/cli/src/core/completion-tip.ts` (decision logic, raw config
      read, atomic write, the message) and call it from `runCommand` in
      `apps/cli/src/cli.ts` after `mod.run(ctx)` returns, never after help, a
      parse refusal, an unknown command or a thrown error; verify the 4.1 tests
      pass and `mise run test` shows no other command's output changed.

## 5. T5: round trips under a temporary home

- [ ] 5.1 Add a sandbox helper to `apps/cli/test/fixtures/support.ts` (every
      home-like variable under a fresh temporary directory, `SHELL` set,
      `ZSH`/`ZSH_CUSTOM`/`PSModulePath`/`CI`/`OPENSPEC_NO_COMPLETIONS`/
      `OPENSPEC_NO_AUTO_CONFIG` removed, and a guard that fails when the
      resolved `HOME` is outside the temporary directory); verify with a unit
      test that the guard rejects a real-looking home.
- [ ] 5.2 Add `apps/cli/test/integration/completion-install.test.ts`: install
      then uninstall for bash, zsh, fish and PowerShell; Oh My Zsh; a second
      install changing nothing; the backup after an edit; `cospec` in every
      installed file and no `openspec`; coexistence with the pinned binary's own
      `completion install zsh` in the same temporary home; the uninstall
      confirmation (non-terminal refusal, a pty `n` answer cancelling, `-y`); an
      orphaned block; the tip once on a pty and never under `--json`, `CI`,
      `OPENSPEC_NO_COMPLETIONS=1`, a pipe, `completion` or `__complete`, and a
      deferred run leaving the config alone. The pty cases skip where `script`
      is absent. Verify with `mise run test:integration`.

## 6. Docs, shared guidance and the living spec

- [x] 6.1 Update `apps/docs/guide/installation.md` "Shell completion": the "no
      `install`/`uninstall`" paragraph and the per-shell copy-paste one-liners
      go in favour of `cospec completion install`, its `--verbose`, `uninstall`
      and `-y`, the four shells, the targets table, the home-derived rule and
      the `ZDOTDIR` limit, `OPENSPEC_NO_AUTO_CONFIG`, and the tip with its
      suppression rules. Verify with `mise run docs:build` and a search showing
      the removed sentence is gone.
- [x] 6.2 Update `apps/docs/reference/commands.md`: the `completion` row (four
      shells, `install`, `uninstall`, `--verbose`, `-y`), the example of a
      pending subcommand's `'<subcommand>' is not supported yet` answer (it
      named `completion install` and `uninstall`; point it at a subcommand that
      is still pending), and the `--json` refusal sentence that names
      `completion`. Verify with `mise run docs:build`.
- [x] 6.3 Update `apps/docs/guide/harness-setup.md`: the "no global state under
      your home directory" sentence, to say what cospec writes under home and
      only when asked (`completion install`) or once (`completionTipSeen`);
      record `completionTipSeen` on the page that owns the global config keys
      (`apps/docs/reference/configuration.md`) as runtime-managed, shared with
      OpenSpec. Scope the same claim in `docs/harness-integration.md` (which
      lists shell completions as out of scope) and `README.md` to the harness
      files it is about. Verify with `mise run docs:build`, and a rebase-time
      check that R9 has not already rewritten the sentence.
- [x] 6.4 Update `.agents/shared.md` (cospec writes under home now; the
      installer and tip live in `core/completions/install.ts` and
      `core/completion-tip.ts`; tests that install use the home sandbox helper)
      and run `mise run agents:sync`; verify `mise run agents:check` passes.
- [x] 6.5 Edit the Purpose paragraph of
      `openspec/specs/cospec-shell-completion/spec.md` (it says the command
      "writes nothing" and is "stdout only"), which archive's requirement merge
      does not touch. Verify `mise run cospec -- validate --specs --strict`
      passes.

## 7. Verify and close out

- [ ] 7.1 Run `mise run check` and fix every failure at its root; verify it
      exits 0.
- [ ] 7.2 Fill in `verification.md`: mark each row `[x]` with the observed
      result after `->`, every install and uninstall row run under a temporary
      `HOME`; verify `mise run cospec -- validate completion-install --strict`
      passes and no row is a bare `[ ]`.
- [ ] 7.3 Tick this box last, after every other task and every ledger row: the
      archive commit follows this one, so the change is archived as the final
      commit on the PR branch and never in a PR of its own. Verify with
      `mise run cospec -- validate completion-install --strict`.
