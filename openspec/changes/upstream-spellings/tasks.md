# Tasks

Each numbered group is one track and ends in a commit, so an interruption loses
at most the group in flight. Command modules are exclusive to their track; the
shared registries (`command-table.ts`, `aliases.yaml`, `parity-pending.yaml`,
the differential and matrix fixtures) are edited row by row, each track touching
only its own command's row, alias line and pending entry (design decision 14).
Group 1 lands the contract red; groups 4–10 and 12 flip it green one surface at
a time. Group 12 waits for the rebase in group 11.

## 1. T7 — tests first (`apps/cli/test/contract/upstream-spellings.test.ts` new; the named rows of `unknown-option-differential.test.ts`, `precedence-matrix.test.ts`, `test/unit/core/command-table.test.ts`)

- [x] 1.1 Create `upstream-spellings.test.ts` on the upstream oracle with one
      row per ledger row 1.1–1.10, 2.1–2.2, 3.1–3.3, 4.1–4.5, each as
      `test.failing`, each asking the pinned binary at test time (no hand-typed
      upstream string), and verify every row fails for the reason the ledger's
      "before" names
- [x] 1.2 Rewrite the `expect: 'pending'` differential rows
      (`init --tools     claude .`, `update .`, `update --force .`,
      `new change x`, `completion generate bash`,
      `instructions … --schema spec-driven`) to their target expectation, add
      `experimental --json` as `cospec-only` and `help --bogus` (both parsed)
      and `experimental --bogus` (both parse-rejected) as `same`, mark each
      `test.failing`, and verify they fail for the reason the ledger names
- [x] 1.3 Rewrite the precedence matrix's `help` `PENDING_ROWS` as agreement
      rows, add `help bogus`, `help help`, `help --bogus`, `help -- list`, and
      move the `instructions` missing-argument rows and
      `instructions proposal --schema --help` to agreement with the binary, each
      `test.failing`, and verify they fail
- [x] 1.4 Remove the `upstream-spellings` rows from the pending lists in
      `command-table.test.ts` and add the target assertions (alias spelling,
      hidden flags, lenient `help` operands) as `test.failing`
- [x] 1.5 Rewrite the `instructions` rows of `relayed-remedies.test.ts`'s "a
      successful context or instructions is relayed byte-for-byte" block to the
      target (reference fields name `cospec`, user content untouched), leaving
      its `context` rows as they are, each `test.failing`
- [x] 1.6 Commit `test(cli): pin upstream spellings against the pinned binary`

## 2. T6 — alias marking and the two-way reachability check (`apps/cli/src/core/command-table.ts` shape and parser only; `apps/cli/test/contract/reachability.test.ts`)

- [x] 2.1 Add `aliasOf` to `FlagSpec`, `SubcommandSpec` and row types,
      `FlagSpec.hidden` (omitted by `offeredFlags`), and the row attribute
      `operands: 'lenient'`; teach `parseCommandArgs` to accept an alias
      spelling with its own placeholder, store its value under the canonical
      name, record the typed spelling, resolve a repeat across spellings
      last-wins, and ignore undeclared options and excess operands on a lenient
      row; verify with the 1.4 unit rows flipped to `test`
- [x] 2.2 In `reachability.test.ts`: `AliasEntry` gains the `flag` kind and
      subcommand `command` paths; `cospecReaches` excludes a surface marked
      `aliasOf`; `aliasTargetExists` requires the marking; add the two-way
      marking ↔ entry check, the `takesValue` agreement for flag aliases, and
      the mutated-input negative cases of design decision 1; verify the test is
      green with no surface changed yet
- [x] 2.3 Commit `test(cli): resolve command and flag aliases two ways`

## 3. Remedy enumeration reads YAML as YAML (`apps/cli/test/contract/remedy-enumeration.test.ts`)

- [x] 3.1 Parse each pinned `.yaml` with `yaml` and enumerate the trimmed lines
      of every string scalar; drop `YAML_COMMENT` and its `isComment` branch;
      add the mutated-copy row of ledger 6.1; verify the existing
      classifications still match and the mutated heading fails the test
- [x] 3.2 Commit `test(cli): read pinned schema yaml by its own syntax`

## 4. T1 — `init --tools` (`apps/cli/src/commands/init.ts`; the `init` row, its `aliases.yaml` line and pending entry)

- [x] 4.1 Mark the `init` row's `--tools <tools>` `aliasOf: '--harness'`, add
      the `aliases.yaml` flag entry, delete
      `{ kind: flag, path: [init], flag: --tools }` from `parity-pending.yaml`,
      and make `init.ts`'s harness refusal name the typed spelling; verify
      ledger 1.1 and 5.1 rows flip to `test` and pass
- [x] 4.2 Commit `fix(cli): read init --tools as upstream's --harness`

## 5. T1 — `experimental` (`apps/cli/src/commands/experimental.ts` new; `cli.ts` `COMMAND_MODULES` entry; the `experimental` row, its alias line and pending entry; `support/remedy-sources.ts` `EXPERIMENTAL` reason)

- [x] 5.1 Add the hidden `experimental` row (`aliasOf: 'init'`,
      `store: 'refused'`, `json: 'accepted'`, `--tool <tool-id>`,
      `--no-interactive` no-op) and `experimental.ts` (respelled note unless
      `--json`, then `init` re-parsed with `--tool` as `--harness`); add the
      alias entry, delete the `experimental` pending entry, rewrite the
      `notRelayed.EXPERIMENTAL` reason; `experimental.ts` reads `ctx.parsed`
      (the `no-legacy-parser` unit test covers every `table` module); verify
      ledger 1.2, 7.2 and the `experimental --json` / `experimental --bogus`
      differential rows pass
- [x] 5.2 Commit `fix(cli): add the hidden experimental alias of init`

## 6. T2 — `new change` (`apps/cli/src/commands/new.ts`; the `new` row, its alias line and pending entry)

- [x] 6.1 Declare the `new change` subcommand (`aliasOf: 'new'`, `<name>`,
      `--schema`, `--description`, `--goal`, hidden `--initiative` / `--areas`),
      add the alias entry, delete the `new change` pending entry; route it in
      `new.ts` with the default schema from `config.yaml` / `config.yml`
      `schema:` else `spec-driven`, and delegate an unresolvable `--schema` so
      the binary's refusal is relayed; verify ledger 1.7, 1.10 and
      `new change x` differential pass
- [x] 6.2 Forward `--goal` on both spellings (`new` row gains a cospec-origin
      `--goal <text>`); verify ledger 1.8
- [x] 6.3 Refuse `--initiative` / `--areas` first with the probed message or
      document; verify ledger 1.4
- [x] 6.4 Lift `change` and `root` from the wrapped document into both JSON
      shapes (typed and legacy lanes); verify ledger 1.3 and 1.9
- [x] 6.5 Commit `fix(cli): accept upstream's new change spelling`

## 7. T3 — `update [path]` (`apps/cli/src/commands/update.ts`; the `update` row's positional and its pending entry)

- [x] 7.1 Mark the positional handled, delete its pending entry, and run
      `update.ts` on `resolve(ctx.cwd, path)`; verify ledger 1.5 and the
      `update .` / `update --force .` differential rows pass
- [x] 7.2 Commit `fix(cli): update the project named by update's path`

## 8. T4 — `completion generate` (`apps/cli/src/commands/completion.ts`; the `completion` row, its alias line, pending entries and hidden fixture)

- [x] 8.1 Declare the `generate` subcommand (`aliasOf: 'completion'`, `[shell]`
      with `pendingValues: {powershell: completion-install}`), add the alias
      entry, delete the `completion generate` pending entry, add the
      `[completion, generate]` `powershell` pending entry and its hidden
      fixture, and feed the subcommand's `[shell]` to `completion.ts`'s `run`;
      verify ledger 1.6, 5.2 and the `completion generate bash` differential row
      pass
- [x] 8.2 Commit `fix(cli): accept upstream's completion generate spelling`

## 9. Program-level `help` (`apps/cli/src/commands/help.ts` new; `cli.ts` `COMMAND_MODULES` entry; the `help` row and its pending entry)

- [x] 9.1 Add the visible `help` row (`operands: 'lenient'`, optional `command`)
      and `help.ts` (program help; a row's help, hidden rows included; program
      help on stderr and exit 1 for any other name, `help` included), reading
      `ctx.parsed` like every `table` module; delete the `help` pending entry;
      verify ledger 2.1–2.3, 5.5 and the `help --bogus` differential row pass
- [x] 9.2 Commit `fix(cli): answer program-level help like commander`

## 10. T5 — `instructions` forwarding (`apps/cli/src/commands/instructions.ts`; the `instructions` row and its pending entry)

- [x] 10.1 Mark `--schema` handled and the `artifact` positional optional,
      delete the `instructions --schema` pending entry, forward `--change` /
      `--schema` whenever given, and drop the local `--change` refusal so the
      binary answers; forward `instructions apply` with no `--change`; verify
      ledger 3.1, 3.2, 3.4 and the `instructions … --schema` differential row
      pass
- [x] 10.2 Commit `fix(cli): forward every instructions flag to the binary`

## 11. Rebase onto `root-resolution-parity`

- [x] 11.1 Once `root-resolution-parity` has merged, rebase this branch onto
      `main` (`git rebase`, push with `--force-with-lease`), resolve conflicts
      in the registries row by row, and verify `mise run check` is green and the
      shared structural respell helper is exported from
      `passthrough-command.ts`; flip the four held ledger-3.5 rows (exit 2 from
      `sub/deep` and `openspec/`) to `test`

## 12. T5 — `instructions` success path from the document (`apps/cli/src/core/instructions-render.ts` new; `apps/cli/src/commands/instructions.ts`; `apps/cli/src/core/remedies.ts` `SCHEMA_LINES`; `support/remedy-sources.ts` rows)

- [x] 12.1 Port `printInstructionsText` and the reference-block renderer with
      its escape helpers into `instructions-render.ts`; switch the success path
      to one `--json` spawn rendered by cospec (text) or re-printed (`--json`),
      and the text-mode failure path to a re-run relayed through
      `relayRespelled`; verify ledger 4.1
- [x] 12.2 Commit `fix(cli): render instructions from the binary's document`
- [x] 12.3 Pass the document through the shared helper with the field map
      `references[].fetch`, `references[].status[].fix` and the whole-value
      allowlist rule (adding that rule to the helper if it lands with a
      leading-token rule only); remove the `instructions` `REACHABLE_OWNED` rows
      for `core/references.js`; flip the `instructions` rows of
      `relayed-remedies.test.ts` (task 1.5) to `test`; verify ledger 4.2 and 4.3
- [x] 12.4 Commit `fix(cli): spell instructions reference fields through cospec`
- [x] 12.5 Add `SCHEMA_LINES` (the ten pinned `schemas/spec-driven/**` lines
      with their cospec spellings), the `schema which <name> --json`
      `source: package` gate, and move those ten rows from `REACHABLE_OWNED` to
      `REMEDY_SOURCES`; verify ledger 4.4, 4.5 and 4.6
- [x] 12.6 Commit
      `fix(cli): spell the built-in schema's reference lines through cospec`
- [x] 12.7 Route the `instructions` failure path's `Create one with: …` hint
      through the shared helper; verify ledger 3.3
- [x] 12.8 Commit
      `fix(cli): respell the instructions new-change hint through the shared helper`

## 13. Docs (`apps/docs/reference/commands.md`, `apps/docs/guide/installation.md`, `apps/docs/.vitepress/parity.data.ts`, `apps/docs/concepts/how-it-relates-to-openspec.md`, `docs/architecture.md`, `.agents/shared.md`)

- [x] 13.1 Update `reference/commands.md` and `guide/installation.md` per ledger
      8.1 and 8.2
- [x] 13.2 Teach `parity.data.ts` to read `aliases.yaml` and render the
      upstream-spelling list on `how-it-relates-to-openspec.md`; run
      `mise run docs:build`; verify ledger 8.3
- [x] 13.3 Update `docs/architecture.md` (ledger 8.4) and `.agents/shared.md`,
      then `mise run agents:sync` and `mise run agents:check`; verify ledger 8.5
- [x] 13.4 Commit
      `docs(cli): document upstream spellings and document-built instructions`

## 14. Close-out

- [x] 14.1 Drop `upstream-spellings` from `PendingOwner`, `KNOWN_OWNERS`,
      `OWNERS` and the `parity-pending.yaml` section header, and `instructions`
      from `SUCCESS_RELAYS` once no `REACHABLE_OWNED` row names it; verify
      ledger 4.6, 5.3 and 7.3
- [x] 14.2 Run `mise run test`, `test:contract`, `test:integration`,
      `generate:check` and `mise run check`; record evidence on every ledger
      row, and hand ledger 9.1 (`mise run eval:e2e`, human-held keys) to a human
      with the fixtures it needs
- [x] 14.3 Commit `chore(cli): close out upstream-spellings`
- [ ] 14.4 `mise run cospec -- archive upstream-spellings` as the last commit on
      the PR branch, before merge

## 15. Round-2 review fixes (the rows first, then one fix per commit)

- [x] 15.1 Pin the rows of ledger 1.12–1.14, 3.5, 3.6 and 7.4 against the binary
      (failing ones as `test.failing`), rewrite the 3.2 `apply --change nope`
      row to `cospec apply nope`'s answer, and restore main's byte-for-byte
      relay rows live beside the held targets (ledger 4.7); commit
      `test(cli): pin round-2 upstream-spellings rows against the binary`
- [x] 15.2 `instructions apply --change <id>` always runs the gate (ledger 3.2,
      3.5); commit
      `fix(cli): run the gate for every instructions apply --change`
- [x] 15.3 `--schema` there refused before the gate, one document under `--json`
      (ledger 3.6); commit
      `fix(cli): refuse instructions apply --schema as one document`
- [x] 15.4 No closest-match hint for an unknown short option (ledger 7.4);
      commit `fix(cli): offer no closest match for an unknown short option`
- [x] 15.5 Empty and cased tool lists read as upstream (ledger 1.12); commit
      `fix(cli): read an empty or cased tool list as upstream does`
- [x] 15.6 `new change` empty `--schema` and unusable `config.yaml` (ledger
      1.13); commit
      `fix(cli): read new change's empty --schema and bad config as upstream`
- [x] 15.7 Case-insensitive completion shell (ledger 1.14); commit
      `fix(cli): read the completion shell name case-insensitively`
- [x] 15.8 Docs corrections (ledger 8.6); commit
      `docs(cli): correct the alias kinds and new change --json shape`

## 16. Round-3 review fixes (the rows first, then one fix per commit)

- [x] 16.1 Pin the rows of ledger 7.5 (a long option's hint is commander's
      `suggestSimilar`) and the extended 1.13 rows (every config field the
      binary warns about, the whitespace `schema:`) against the binary, failing
      ones as `test.failing`; commit
      `test(cli): pin round-3 upstream-spellings rows against the binary`
- [x] 16.2 The long-option hint ports commander's `suggestSimilar` (ledger 7.5);
      commit `fix(cli): hint an unknown long option as commander does`
- [x] 16.3 `new change` with no `--schema` lets the binary resolve `config.yaml`
      (ledger 1.13); commit
      `fix(cli): let the binary resolve new change's default schema`
- [x] 16.4 Record the round-3 evidence (ledger 1.13, 7.5); commit
      `chore(cli): record upstream-spellings round-3 evidence`

## 17. Round-4 review fixes (the rows first, then one fix per commit)

- [x] 17.1 Pin the rows of ledger 3.7 and 3.8 against the binary (failing ones
      as `test.failing`) and restore `expectReferencesRespelled`'s stderr and
      `--json` byte assertions (ledger 4.8); commit
      `test(cli): pin round-4 upstream-spellings rows against the binary`
- [x] 17.2 Every `instructions` failure answers from the binary's `--json`
      document through the shared helper, text rendered from it (ledger 3.7);
      commit `fix(cli): answer every instructions failure from its document`
- [ ] 17.3 Docs state the failure path as it now holds (ledger 8.7); commit
      `docs(cli): document instructions failures built from the document`
- [ ] 17.4 Record the round-4 evidence (ledger 3.7, 3.8, 4.8, 8.7); commit
      `chore(cli): record upstream-spellings round-4 evidence`
