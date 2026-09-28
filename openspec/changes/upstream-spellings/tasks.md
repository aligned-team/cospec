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

- [ ] 4.1 Mark the `init` row's `--tools <tools>` `aliasOf: '--harness'`, add
      the `aliases.yaml` flag entry, delete
      `{ kind: flag, path: [init], flag: --tools }` from `parity-pending.yaml`,
      and make `init.ts`'s harness refusal name the typed spelling; verify
      ledger 1.1 and 5.1 rows flip to `test` and pass
- [ ] 4.2 Commit `fix(cli): read init --tools as upstream's --harness`

## 5. T1 — `experimental` (`apps/cli/src/commands/experimental.ts` new; `cli.ts` `COMMAND_MODULES` entry; the `experimental` row, its alias line and pending entry; `support/remedy-sources.ts` `EXPERIMENTAL` reason)

- [ ] 5.1 Add the hidden `experimental` row (`aliasOf: 'init'`,
      `store: 'refused'`, `json: 'accepted'`, `--tool <tool-id>`,
      `--no-interactive` no-op) and `experimental.ts` (respelled note unless
      `--json`, then `init` re-parsed with `--tool` as `--harness`); add the
      alias entry, delete the `experimental` pending entry, rewrite the
      `notRelayed.EXPERIMENTAL` reason; `experimental.ts` reads `ctx.parsed`
      (the `no-legacy-parser` unit test covers every `table` module); verify
      ledger 1.2, 7.2 and the `experimental --json` / `experimental --bogus`
      differential rows pass
- [ ] 5.2 Commit `fix(cli): add the hidden experimental alias of init`

## 6. T2 — `new change` (`apps/cli/src/commands/new.ts`; the `new` row, its alias line and pending entry)

- [ ] 6.1 Declare the `new change` subcommand (`aliasOf: 'new'`, `<name>`,
      `--schema`, `--description`, `--goal`, hidden `--initiative` / `--areas`),
      add the alias entry, delete the `new change` pending entry; route it in
      `new.ts` with the default schema from `config.yaml` / `config.yml`
      `schema:` else `spec-driven`, and delegate an unresolvable `--schema` so
      the binary's refusal is relayed; verify ledger 1.7, 1.10 and
      `new change x` differential pass
- [ ] 6.2 Forward `--goal` on both spellings (`new` row gains a cospec-origin
      `--goal <text>`); verify ledger 1.8
- [ ] 6.3 Refuse `--initiative` / `--areas` first with the probed message or
      document; verify ledger 1.4
- [ ] 6.4 Lift `change` and `root` from the wrapped document into both JSON
      shapes (typed and legacy lanes); verify ledger 1.3 and 1.9
- [ ] 6.5 Commit `fix(cli): accept upstream's new change spelling`

## 7. T3 — `update [path]` (`apps/cli/src/commands/update.ts`; the `update` row's positional and its pending entry)

- [ ] 7.1 Mark the positional handled, delete its pending entry, and run
      `update.ts` on `resolve(ctx.cwd, path)`; verify ledger 1.5 and the
      `update .` / `update --force .` differential rows pass
- [ ] 7.2 Commit `fix(cli): update the project named by update's path`

## 8. T4 — `completion generate` (`apps/cli/src/commands/completion.ts`; the `completion` row, its alias line, pending entries and hidden fixture)

- [ ] 8.1 Declare the `generate` subcommand (`aliasOf: 'completion'`, `[shell]`
      with `pendingValues: {powershell: completion-install}`), add the alias
      entry, delete the `completion generate` pending entry, add the
      `[completion, generate]` `powershell` pending entry and its hidden
      fixture, and feed the subcommand's `[shell]` to `completion.ts`'s `run`;
      verify ledger 1.6, 5.2 and the `completion generate bash` differential row
      pass
- [ ] 8.2 Commit `fix(cli): accept upstream's completion generate spelling`

## 9. Program-level `help` (`apps/cli/src/commands/help.ts` new; `cli.ts` `COMMAND_MODULES` entry; the `help` row and its pending entry)

- [ ] 9.1 Add the visible `help` row (`operands: 'lenient'`, optional `command`)
      and `help.ts` (program help; a row's help, hidden rows included; program
      help on stderr and exit 1 for any other name, `help` included), reading
      `ctx.parsed` like every `table` module; delete the `help` pending entry;
      verify ledger 2.1–2.3, 5.5 and the `help --bogus` differential row pass
- [ ] 9.2 Commit `fix(cli): answer program-level help like commander`

## 10. T5 — `instructions` forwarding (`apps/cli/src/commands/instructions.ts`; the `instructions` row and its pending entry)

- [ ] 10.1 Mark `--schema` handled and the `artifact` positional optional,
      delete the `instructions --schema` pending entry, forward `--change` /
      `--schema` whenever given, and drop the local `--change` refusal so the
      binary answers; forward `instructions apply` with no `--change`; verify
      ledger 3.1, 3.2, 3.4 and the `instructions … --schema` differential row
      pass
- [ ] 10.2 Commit `fix(cli): forward every instructions flag to the binary`

## 11. Rebase onto `root-resolution-parity`

- [ ] 11.1 Once `root-resolution-parity` has merged, rebase this branch onto
      `main` (`git rebase`, push with `--force-with-lease`), resolve conflicts
      in the registries row by row, and verify `mise run check` is green and the
      shared structural respell helper is exported from `passthrough-command.ts`

## 12. T5 — `instructions` success path from the document (`apps/cli/src/core/instructions-render.ts` new; `apps/cli/src/commands/instructions.ts`; `apps/cli/src/core/remedies.ts` `SCHEMA_LINES`; `support/remedy-sources.ts` rows)

- [ ] 12.1 Port `printInstructionsText` and the reference-block renderer with
      its escape helpers into `instructions-render.ts`; switch the success path
      to one `--json` spawn rendered by cospec (text) or re-printed (`--json`),
      and the text-mode failure path to a re-run relayed through
      `relayRespelled`; verify ledger 4.1
- [ ] 12.2 Commit `fix(cli): render instructions from the binary's document`
- [ ] 12.3 Pass the document through the shared helper with the field map
      `references[].fetch`, `references[].status[].fix` and the whole-value
      allowlist rule (adding that rule to the helper if it lands with a
      leading-token rule only); remove the `instructions` `REACHABLE_OWNED` rows
      for `core/references.js`; flip the `instructions` rows of
      `relayed-remedies.test.ts` (task 1.5) to `test`; verify ledger 4.2 and 4.3
- [ ] 12.4 Commit `fix(cli): spell instructions reference fields through cospec`
- [ ] 12.5 Add `SCHEMA_LINES` (the ten pinned `schemas/spec-driven/**` lines
      with their cospec spellings), the `schema which <name> --json`
      `source: package` gate, and move those ten rows from `REACHABLE_OWNED` to
      `REMEDY_SOURCES`; verify ledger 4.4, 4.5 and 4.6
- [ ] 12.6 Commit
      `fix(cli): spell the built-in schema's reference lines through cospec`
- [ ] 12.7 Route the `instructions` failure path's `Create one with: …` hint
      through the shared helper; verify ledger 3.3
- [ ] 12.8 Commit
      `fix(cli): respell the instructions new-change hint through the shared helper`

## 13. Docs (`apps/docs/reference/commands.md`, `apps/docs/guide/installation.md`, `apps/docs/.vitepress/parity.data.ts`, `apps/docs/concepts/how-it-relates-to-openspec.md`, `docs/architecture.md`, `.agents/shared.md`)

- [ ] 13.1 Update `reference/commands.md` and `guide/installation.md` per ledger
      8.1 and 8.2
- [ ] 13.2 Teach `parity.data.ts` to read `aliases.yaml` and render the
      upstream-spelling list on `how-it-relates-to-openspec.md`; run
      `mise run docs:build`; verify ledger 8.3
- [ ] 13.3 Update `docs/architecture.md` (ledger 8.4) and `.agents/shared.md`,
      then `mise run agents:sync` and `mise run agents:check`; verify ledger 8.5
- [ ] 13.4 Commit
      `docs(cli): document upstream spellings and document-built instructions`

## 14. Close-out

- [ ] 14.1 Drop `upstream-spellings` from `PendingOwner`, `KNOWN_OWNERS`,
      `OWNERS` and the `parity-pending.yaml` section header, and `instructions`
      from `SUCCESS_RELAYS` once no `REACHABLE_OWNED` row names it; verify
      ledger 4.6, 5.3 and 7.3
- [ ] 14.2 Run `mise run test`, `test:contract`, `test:integration`,
      `generate:check` and `mise run check`; record evidence on every ledger
      row, and hand ledger 9.1 (`mise run eval:e2e`, human-held keys) to a human
      with the fixtures it needs
- [ ] 14.3 Commit `chore(cli): close out upstream-spellings`
- [ ] 14.4 `mise run cospec -- archive upstream-spellings` as the last commit on
      the PR branch, before merge
