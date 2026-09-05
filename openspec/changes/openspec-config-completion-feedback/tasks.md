## 1. WI-0 Preflight

- [ ] 1.1 Determine the earliest wrapped-OpenSpec version that ships `config`,
      `completion`, and `feedback` by probing the upstream changelog and the
      pinned 1.11.0 binary, and verify by recording the finding in the change
      and, where a surface postdates the 1.0.0 floor, adding its row to the
      per-surface runtime-minimums table rather than raising
      `OPENSPEC_VERSION_FLOOR`
- [ ] 1.2 Confirm against the real pinned binary whether `openspec schemas`
      emits `--json`, and verify by recording the answer as the decision to
      include or omit `schemas` as a `__complete` source (omitted unless
      confirmed)

## 2. WI-1 cospec config

- [ ] 2.1 Add `apps/cli/src/commands/config.ts` with a pure argv builder that
      hoists `--scope`, appends `--json` only for `list`, and never emits
      `--store` or `--no-color`, and verify with unit assertions over the built
      argv for all eight subcommands (ledger 1.1)
- [ ] 2.2 Wire the Class A subcommands through `passthroughOpenspec` with
      `expect.exitCodes = [0, 1]`, a stdout deny-list, and no `resolveRoot`
      call, and verify with integration runs of `path`, `list --json`, and `get`
      on an unset key against the real binary under a sandboxed
      `XDG_CONFIG_HOME`/`HOME` (ledger 1.3, 1.4)
- [ ] 2.3 Refuse `cospec config --store <id>` and a missing subcommand with exit
      1 and named messages, and verify with unit tests asserting zero wrapped
      spawns on both paths (ledger 1.2)
- [ ] 2.4 Implement the Class B terminal handover for `edit`, bare `profile`,
      and unconfirmed `reset --all` — version assertion, inherited stdio,
      `shell: false`, handover env with `OPENSPEC_NO_COMPLETIONS=1`, verbatim
      exit code including 130 — and verify with the `EDITOR=true` and non-TTY
      integration runs (ledger 2.1, 2.2)
- [ ] 2.5 Implement the `--json` envelopes for
      `path`/`get`/`set`/`unset`/`reset`, the verbatim `list --json` relay, and
      the Class B `--json` refusal, and verify each invocation emits exactly one
      parseable document (ledger 1.4, 2.3)
- [ ] 2.6 Implement the stderr advisory notes for `telemetry.enabled` and for
      `profile`/`workflows`/`delivery`, and verify with the stream-separated
      integration runs plus a unit test over the note selector across every
      known key (ledger 3.1, 3.2, 3.3)

## 3. WI-2 cospec completion

- [ ] 3.1 Add `apps/cli/src/core/completions/spec.ts` deriving a
      `CompletionSpec` from the exported `COMMANDS` table and `GLOBAL_OPTIONS`,
      including the pure per-command flag extractor and the dynamic-argument
      slot declarations, and verify with a snapshot unit test over the real
      table (ledger 4.1)
- [ ] 3.2 Add the `bash.ts`, `zsh.ts`, and `fish.ts` renderers, and verify each
      generated script parses under `bash -n`, `zsh -n`, and `fish --no-execute`
      (ledger 4.2)
- [ ] 3.3 Add `apps/cli/src/commands/completion.ts` with `$SHELL` basename
      detection, the unsupported-shell refusal, the `--json` refusal, and no
      filesystem writes, and verify with the detection integration run that
      snapshots `HOME` before and after (ledger 4.3)
- [ ] 3.4 Add `apps/cli/src/commands/complete.ts` serving `changes`, `specs`,
      and `types` with the silent exit-1 failure contract, and verify with the
      seeded-repo run, the rootless and unknown-source runs asserting both
      streams empty, and the spawn-spy test for `types` (ledger 5.1, 5.2, 5.3)

## 4. WI-3 cospec feedback

- [ ] 4.1 Add `apps/cli/src/commands/feedback.ts` title, body, and provenance
      formatting — grapheme-aware 72-char truncation, Summary/Details sections,
      cospec version plus wrapped-OpenSpec resolution source and version — and
      verify with unit tests over both resolution sources (ledger 6.1, 6.6)
- [ ] 4.2 Implement submission via `gh issue create` with array argv,
      `shell: false`, no `--label`, and the `gh` presence plus `gh auth status`
      gates, and verify with the authenticated stub-`gh` integration run
      asserting the received argv (ledger 6.2)
- [ ] 4.3 Implement the manual-submission fallback (formatted block plus
      prefilled `aligned-team/cospec` issue URL, exit 0) and the
      other-gh-failure path, and verify with the `gh`-absent and
      `gh auth status`-failing integration runs (ledger 6.3)
- [ ] 4.4 Implement `--upstream` as a version-asserted piped relay with a
      verbatim child exit code and the destination note on stderr, and verify
      with the stub-`gh` run whose exit code falls outside the shared allow-list
      (ledger 6.4)
- [ ] 4.5 Implement the `--json` document with `submitted`, `url`, `title`, and
      `repo`, and verify it is exactly one parseable document on both the
      submitted and the manual-fallback paths (ledger 6.2)

## 5. WI-4 Registration and harness

- [ ] 5.1 Add the four `COMMANDS` entries (`config`, `completion`, `feedback`,
      hidden `__complete`) and four literal `COMMAND_MODULES` imports to
      `apps/cli/src/cli.ts`, and verify `cospec --help` lists the three visible
      commands, omits `__complete`, and each dispatches rather than reporting
      "not yet implemented"
- [ ] 5.2 Extend `renderCodexRules` in `apps/cli/src/harness/adapters.ts` with
      the five read-only prefixes only, run `mise run generate`, and verify with
      `mise run generate:check` clean plus assertions that the mutating prefixes
      are absent from `.codex/rules/cospec.rules` (ledger 7.2)

## 6. WI-5 Tests and packaging guards

- [ ] 6.1 Land the unit suites (`config-args`, `feedback-format`, `completions`)
      and the integration suites (`config`, `completion`, `feedback`) that the
      ledger rows above name, and verify `mise run test` and
      `mise run test:integration` are green with no pre-existing test weakened
- [ ] 6.2 Land `apps/cli/test/contract/config-surface.test.ts` against the real
      pinned binary with `XDG_CONFIG_HOME` and `HOME` sandboxed into a temp dir,
      including the trailing-`--no-color` acceptance rows, and verify
      `mise run test:contract` is green and the developer's real global config
      is untouched (ledger 1.5)
- [ ] 6.3 Extend `apps/cli/test/integration/pack-standalone.test.ts` to run
      `cospec config path`, `cospec completion zsh`, and
      `cospec feedback --help` from the packed standalone binary, and verify
      `mise run test:pack` is green (ledger 7.1)
- [ ] 6.4 Run the ledger end to end on the final branch state, recording an
      observed result after each row's arrow or a `[~] defer:` reason, and
      verify `mise run check` is green (ledger 7.4)

## 7. WI-6 Docs and agent guidance

- [ ] 7.1 Update `apps/docs/reference/commands.md` with rows for the three
      commands and the read-only prose list marking the mutating config
      subcommands as exceptions, and verify `mise run docs:build` is green with
      each fact stated on exactly one page (ledger 8.1)
- [ ] 7.2 Add the machine-global OpenSpec config section to
      `apps/docs/reference/configuration.md` — precedence table, the two stderr
      notes, the `defaultStore` resolution order cross-linked to Stores, the
      `--json` envelope shapes — and verify no other page restates those facts
      (ledger 8.1)
- [ ] 7.3 Add the per-shell completion install snippets to
      `apps/docs/guide/installation.md`, and verify each snippet is
      copy-pasteable and matches the shell names the command actually accepts
      (ledger 8.1, 4.3)
- [ ] 7.4 Extend `docs/architecture.md` with the two config passthrough
      exceptions and the terminal-handover class shared by `workset open` and
      `config edit|profile|reset`, and verify by reading the section against the
      shipped code (ledger 8.3)
- [ ] 7.5 Update `.agents/shared.md` so the every-everyday-surface paragraph
      names `config`, `completion`, and `feedback`, run `mise run agents:sync`,
      and verify `mise run agents:check` is clean (ledger 8.2)
- [ ] 7.6 Settle the suspected trailing-`--no-color` hazard on the other
      passthroughs with the contract rows rather than a follow-up change, and
      verify no artefact in this change still claims upstream rejects a trailing
      `--no-color` (the probe shows it is accepted, so there is no hazard to
      hand on)
