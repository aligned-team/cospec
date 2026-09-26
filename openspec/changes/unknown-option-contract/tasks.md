# Tasks

Each numbered group is one track with exclusive files and ends in a commit, so
an interruption loses at most the group in flight. Groups 1–3 land the contract
red; 4–7 turn it green; 8 documents it.

## 1. T1 — the command table and parser (`apps/cli/src/core/command-table.ts`, `apps/cli/test/unit/core/command-table.test.ts`)

- [x] 1.1 Create `command-table.ts`: per-command rows with `name`, `summary`,
      `hidden`, `parse: 'table' | 'forward'`, `json: 'accepted' | 'refused'` on
      `table` rows (`view` and `completion` refused), `positionals[]`, and
      `flags[]` of
      `{name, short?, takesValue?, placeholder?, values?, description,     status: 'handled' | 'no-op' | {pending: '<slug>'}}`;
      seed every flag the pinned `COMMAND_REGISTRY` gives the same-named
      command, then cospec's own flags; mark `init --no-animation`,
      `archive -y/--yes`, `list --changes` as no-ops and every entry in the
      design's pending table as pending with its owner slug
- [x] 1.2 Write `parseCommandArgs(row, args)` returning
      `{positionals,     flags}` or a typed refusal; implement the three refusal
      messages, the `--flag=value` form, and the closest-match line using
      `closest()` moved out of `cli.ts` into the table module
- [x] 1.3 Write the `--store-path` guard (`storePathRefusal(json)`) returning
      the respelled redirect text and the `--json` envelope, and the
      `jsonRefusal(command, message)` helper returning the one-document
      `{version: 1, command, ok: false, message}` envelope (design decision 10)
- [x] 1.4 Unit-test the parser (verification 1.5): the six parse cases, and one
      assertion per no-op and per pending flag; commit
      `feat(cli): add the     command table and parser` (ledger 1.5)

## 2. T6 — parity data files (`apps/cli/src/canon/parity/{aliases,exceptions,deprecated}.yaml`)

- [x] 2.1 Write `aliases.yaml` with the `sync` → `sync-specs` workflow alias,
      `exceptions.yaml` with the single self-upgrade entry, and
      `deprecated.yaml` with the `change` (registry-description) and `spec`
      (runtime-stderr, warning text verbatim) noun groups, in the shapes the
      design gives; commit `chore(canon): add parity data files`

## 3. T7 — reachability test, pending list, oracle (`apps/cli/test/contract/reachability.test.ts`, `apps/cli/test/contract/parity-pending.yaml`, `apps/cli/test/contract/support/upstream-oracle.ts`, `apps/cli/test/contract/unknown-option-differential.test.ts`)

- [x] 3.1 Write `support/upstream-oracle.ts`: scaffold a temp root with the
      pinned binary, `oracleJson(argv, root)` with the color-stripped env and
      `OPENSPEC_TELEMETRY=0`, throwing on non-JSON stdout (ledger 5.4)
- [x] 3.2 Write `parity-pending.yaml` exactly as the design's pending table,
      each entry `{kind, path/id, flag?, value?, source?, owner}`
- [x] 3.3 Write `reachability.test.ts`: import the four dist sources, flatten
      every command path, positional slot, flag, flag value, tool id, alias and
      workflow id, resolve each against the table and the four YAML files, fail
      on zero or two resolutions, resolve `AI_TOOLS` ids against cospec's
      harnesses by importing ONLY the `HARNESS_NAMES` export of
      `apps/cli/src/harness/adapters.ts` (no other symbol of that module; its
      name and shape are frozen by `harness-adapter-table`), assert the reverse
      direction (every table entry marked pending ⇔ exactly one
      `parity-pending.yaml` entry with the same owner, and a stale YAML entry
      fails; design decision 11), verify each `deprecated.yaml` mark against the
      registry description or the oracle's stderr, assert `exceptions.yaml` has
      one entry and every pending entry has an owner (ledger 4.1–4.5)
- [x] 3.4 Write `unknown-option-differential.test.ts`: the classifier
      (parse-rejected vs parsed), the per-command row list from verification
      5.1–5.3 with `expect: same | cospec-only | pending`, running each row
      through `cospec` (via `test/fixtures/support.ts`) and the oracle; the
      `--store-path` rows compare cospec's text to the oracle's with only the
      `openspec` → `cospec` respelling (ledger 2.3, 5.1–5.3)
- [x] 3.5 Run `mise run test:contract` and record the red rows (the differential
      and 1.6-style assertions fail on today's parsers); commit
      `test(cli): add the reachability contract and unknown-option     differential`
      with the tests present and the fixture rows that fail today marked `todo`
      in bun so the commit is green, to be un-skipped per command in groups 5
      and 6

## 4. T2 — dispatch and help through the table (`apps/cli/src/cli.ts`)

- [x] 4.1 Replace `COMMANDS[].usage/options` with a render from the table rows;
      `commandHelpText` prints positionals, handled and no-op flags with
      placeholders and descriptions; `helpText` unchanged in shape;
      `cospec     show --help` now lists `--diff` and `--requirements` (ledger
      3.1)
- [x] 4.2 Reject `--store-path` and `--store-path=<v>` in the pre-command loop
      with the guard from 1.3 (text, or the envelope under `--json`), exit 1,
      and treat no later token as the command name (ledger 2.2)
- [x] 4.3 Dispatch: for `table` rows call the parser before loading the command
      module and print the refusal on failure; for `forward` rows pass argv
      through unchanged except for the `--store-path` guard; the
      `CommandContext` gains `parsed?` so a `table` command receives positionals
      and flag values instead of re-reading `ctx.args`
- [x] 4.4 Unit-test `cli.test.ts` for the new help output and the `--store-path`
      positions; un-skip the `--store-path` differential rows; commit
      `fix(cli): dispatch and render help through the command table`

## 5. T4 — lifecycle commands onto the parser (`apps/cli/src/commands/{validate,status,archive,list,apply,migrate,sync-blockers,check-commit}.ts`)

- [x] 5.1 `validate.ts`: read
      `--strict --fast --all --changes --specs     --archived --no-interactive`
      and the positional from `ctx.parsed`; delete the `includes`/`find` reads
      (regression: ledger 1.1)
- [x] 5.2 `status.ts`: `--change`, `--all`, positional from `ctx.parsed` (ledger
      1.2)
- [x] 5.3 `archive.ts`: `--skip-specs`, `--force-incomplete`, the positional;
      `-y/--yes` accepted as no-ops (ledger 2.1)
- [x] 5.4 `list.ts`: `--specs`, `--blocked`; `--changes` no-op (ledger 1.4, 2.1)
- [x] 5.5 `apply.ts`, `migrate.ts`, `sync-blockers.ts`, `check-commit.ts`: each
      onto `ctx.parsed`
- [x] 5.6 Un-skip these commands' differential rows; `mise run test` and
      `mise run test:contract` green; commit
      `fix(cli): parse lifecycle     commands through the command table`

## 6. T5 — setup and passthrough commands onto the parser (`apps/cli/src/commands/{init,update,new,doctor,instructions,show,context,view,complete,completion,feedback}.ts`)

- [x] 6.1 `init.ts`: `resolveTarget` and `argValue` replaced by `ctx.parsed`;
      `--no-animation` no-op; `--tools`, `--language`, `--profile`,
      `--copilot-cloud`, `--no-copilot-cloud` pending (regression: ledger 1.3)
- [x] 6.2 `update.ts`, `doctor.ts`, `new.ts`, `context.ts`, `complete.ts`,
      `completion.ts`: each onto `ctx.parsed`, so an unknown option is refused
      before any work (ledger 1.4); `completion.ts` swaps its inline `--json`
      refusal for `jsonRefusal()` with byte-identical output
- [x] 6.3 `instructions.ts`: onto `ctx.parsed` with `--change`, `--allow-soft`
      handled and `--schema` pending
- [x] 6.4 `view.ts`: onto `ctx.parsed` (`table` row, `json: 'refused'`);
      `--json` is refused with `jsonRefusal('view', …)` — one JSON document on
      stdout, exit 1, no `openspec view` spawned — instead of being silently
      ignored; its differential row (`view --json`) un-skipped (ledger 1.7)
- [x] 6.5 `show.ts`: `forward` row — keep forwarding verbatim; its table row
      declares every upstream flag so help and completion list them.
      `feedback.ts`: `table` row — `parseFeedbackArgs` replaced by `ctx.parsed`
      (`<message>`, `--body <text>`, `--upstream`); the `--upstream` relay
      rebuilds its argv from the parsed values
- [x] 6.6 Un-skip the remaining differential rows; the whole differential and
      the 1.6 no-legacy-parser test (scoped to `table` modules) are live;
      `mise run test:contract` green; commit
      `fix(cli): parse setup and passthrough commands through the command table`

## 7. T3 — completion from the table (`apps/cli/src/core/completions/spec.ts`, `apps/cli/test/unit/core/completions.test.ts`)

- [x] 7.1 `buildCompletionSpec()` reads table rows: flags = handled + no-op,
      positional sources and dynamic flag values kept; delete `extractFlags` and
      its snapshot
- [x] 7.2 Add the three-way help/completion/parser parity test (ledger 3.2,
      3.3); `apps/cli/test/integration/completion.test.ts` green; commit
      `fix(cli): build the completion spec from the command table`

## 8. T8 — docs, data loader, shared guidance (`apps/docs/concepts/how-it-relates-to-openspec.md`, `apps/docs/reference/commands.md`, `apps/docs/.vitepress/parity.data.ts`, `apps/docs/package.json`, `bun.lock`, `docs/architecture.md`, `.agents/shared.md`, `CLAUDE.md`, `AGENTS.md`)

- [x] 8.1 Add `yaml` `2.9.0` (exact) to `apps/docs/devDependencies`, run
      `bun install`, and commit the regenerated `bun.lock` in the same commit
      (ledger 6.6)
- [x] 8.2 Write `apps/docs/.vitepress/parity.data.ts` (`defineLoader` with
      `watch` on `exceptions.yaml`, `deprecated.yaml`, `parity-pending.yaml`)
      returning the three parsed lists
- [x] 8.3 `how-it-relates-to-openspec.md`: a named-exceptions section and the
      still-being-implemented list rendered from the loader next to the
      every-capability sentence; align the frontmatter description with the
      drop-in sentence (ledger 6.1, 6.2)
- [x] 8.4 `reference/commands.md`: the unknown-option contract, the
      `--store-path` redirect, the three no-ops, the forwarded-command rule, and
      `show`'s corrected flag list (ledger 6.3)
- [x] 8.5 `docs/architecture.md`: the command table, the two parse policies, the
      reachability test and its four sources (ledger 6.4)
- [x] 8.6 `.agents/shared.md`: the reachability test is the parity gate;
      exceptions live only in `exceptions.yaml`; then `mise run agents:sync` and
      `mise run agents:check` (ledger 6.5)
- [x] 8.7 `mise run docs:build` and the entry-for-entry check against
      `parity-pending.yaml` (ledger 6.1); commit
      `docs: document the command     table, the unknown-option contract and the parity gate`

## 9. Close-out

- [x] 9.1 `mise run check` green (ledger 7.1–7.5); every ledger row marked with
      observed evidence
- [x] 9.2 Grep the new test files (`command-table.test.ts`,
      `reachability.test.ts`, `unknown-option-differential.test.ts`,
      `precedence-matrix.test.ts`, `forward-relay.test.ts`, and any
      `cli.test.ts`/`completions.test.ts` additions) for `test.todo`/`it.todo`
      and `test.failing`, confirm none remain but the dormant `KNOWN_FAILING`
      branch, and confirm the precedence matrix's `KNOWN_FAILING` set is empty
      (ledger 7.6)
- [ ] 9.3 `mise run cospec -- archive unknown-option-contract` as the last
      commit on the branch

## 10. Review fixes (land before 9.3)

- [x] 10.1 Honour `-V`/`--version` in any position before `--`, ahead of help,
      unknown options, `--store-path` and dispatch, as upstream's program-level
      option is; differential rows for the post-command forms; global-flags row
      in `reference/commands.md` (ledger 1.8)
- [x] 10.2 Name the positional and subcommand refusals (`update [path]`,
      `new change`, `completion generate/install/uninstall`, too many arguments)
      in the BREAKING paragraph and `reference/commands.md`; pin each in the
      differential (ledger 1.9)
- [x] 10.3 Declare the remaining hidden upstream surfaces as reachability
      fixtures (`__complete schemas` / `archived-changes`,
      `new change     --initiative` / `--areas`) with binary probes, mark the
      `__complete` values pending on `cli-surface-parity`, add the `source: cli`
      entries, and correct design decision 6 (ledger 4.6)
- [x] 10.4 Run the `validate --type change x` pending row in a fixture holding a
      change named `change`, and assert empty stdout and the exact stderr on
      every pending row (ledger 1.1)
- [x] 10.5 Delete the dead `COMMANDS` export (and `CommandEntry`) and the stale
      comments in `cli.ts` that still named it or claimed `GLOBAL_OPTIONS` fed
      the completion spec; rewrite `command-table.test.ts`'s parity test against
      `COMMAND_TABLE` and the now-exported `COMMAND_MODULES` (ledger 3.4)
- [x] 10.6 Stop absorbing global flags after a post-command `--`: every later
      token reaches the command's argv as an operand, and the passthrough
      plumbing threads `--json`/`--no-color`/`--store` before the user's `--`
      and reads `--json` only before it; differential rows for `list`, `status`,
      `templates` and `show`; spec requirement and the global-flags note in
      `reference/commands.md` (ledger 1.10)
- [x] 10.7 Refuse a global `--store`/`--cwd` with a missing value
      (`argument missing`) or an empty one (`argument must not be empty`), exit
      1, after a version request and ahead of help, unknown options and
      `--store-path`, instead of dropping it and running on the local repo; unit
      and differential rows; spec requirement and the global-flags note (ledger
      1.11)
- [x] 10.8 `migrate --json` on an already-current change prints the same
      one-document shape as a migration, with `migrated: false`, instead of
      prose; both paths carry `migrated`; the `migrate` row in
      `reference/commands.md` states the shape (ledger 1.12)
- [x] 10.9 `parity.data.ts`: read an emptied (null-parsing)
      `parity-pending.yaml`, `exceptions.yaml` or `deprecated.yaml` as `[]`, and
      confirm the page renders with no empty heading or orphan sentence when the
      pending list is empty (ledger 6.7)
- [x] 10.10 State in the BREAKING paragraph and `reference/commands.md` that
      every table-parsed command refuses an excess positional, with
      `new feat add login`, `init a b`, `apply <slug> extra`, `migrate`,
      `status` and `instructions` examples and the global-flag changes of
      10.6/10.7; differential rows for each; spec scenario; the PR-body copy in
      `.claude/handoff/reports/unknown-option-contract-breaking.md` (ledger 1.9)
- [x] 10.11 Refuse an undeclared option before the command name
      (`cospec --bogus list`, `--jsn list`, `-x list`) with
      `cospec: unknown option '<x>'` and a closest-match suggestion among the
      global flags, exit 1, on every row and ahead of `--store-path` and the
      command, instead of running the command; unit and differential rows; spec
      requirement, the BREAKING paragraph and the global-flags note in
      `reference/commands.md` (ledger 1.13)
- [x] 10.12 Rank a global `--store`/`--cwd` value refusal as upstream does: a
      missing value after the command name yields to an undeclared option before
      it, and an empty value is refused only just before dispatch, after help,
      unknown options, `--store-path`, an unknown command and the command's own
      parse refusals (with no command, unless `--help`); unit and differential
      rows; spec requirements and the global-flags note (ledger 1.14)
- [x] 10.13 Treat a `--` before the command name as upstream's terminator, not
      an unknown option: the next token is the command, a non-dashed token after
      it is still read as the subcommand, every later token is an operand; unit
      and differential rows (Bun-safe spellings); the terminator requirement and
      the global-flags note (ledger 1.15)
- [x] 10.14 Add the precedence matrix contract test: 107 argv rows (version,
      help, unknown option, `--store`/`--cwd` values, `--store-path` in every
      form and position, leading and post-command `--`, bare `help` tokens)
      against `list`, `show`, `config`/`schema`/`store`/`workset` and no
      command, each compared with the binary run under Node (outcome + exit
      code) or declared cospec-only with its intended outcome; rows failing on
      the one-pass `cli.ts` run as `test.failing` (ledger 1.16)
- [x] 10.15 Split `cli.ts`'s global-flag handling into phase A (the program
      level, stopping on its own answer) and phase B (the row's own argv in
      commander's per-level order); delete the cross-level priority flags and
      the dash heuristic after a leading `--`; `helpSubcommand: false` on
      `store`/`workset`; spec requirements, design decision 12, the global-flags
      note in `reference/commands.md` and the BREAKING paragraph (ledger 1.16)
- [x] 10.16 Check whether a user's raw `cospec -- list` loses its `--` before
      cospec sees it: run the built executable directly and inspect the
      published Node launcher (ledger 1.17)
- [x] 10.17 Sharpen the precedence matrix: `outcome()` compares the refusal's
      kind (`refusalKind()` in `support/parse-class.ts`: store-path, unknown
      command or subcommand, unknown option, missing value, too many), a refusal
      whose subject is `--store-path` counting as store-path in either dialect;
      add `--store-path`-before-refusal rows on `list`, `validate`, `show`,
      `config` and after a leading `--`, `<cmd> --no-color help` on
      `config`/`schema`/`completion`, and `--` right after
      `config`/`store`/`workset`; rows failing at HEAD run as `test.failing`
      (ledger 1.18)
- [x] 10.18 Refuse `--store-path` where the binary does: a table row after its
      unknown-option, pending and too-many-arguments refusals (value consumed; a
      missing value refused while parsing); a forward row by asking the binary
      and answering the redirect only for its own `--store-path` refusal,
      relaying anything it refuses first; never after a routing `--`; unit and
      differential rows; spec requirement, design decision 2,
      `docs/architecture.md` and `reference/commands.md` (ledger 1.19)
- [x] 10.19 Phase B routing: a bare `help` is the help token when it is the
      first token to reach the row's argv (after absorbed globals), and a `--`
      that is the first token to reach a row with subcommands routes the next
      token as the subcommand, keeping `--` before the remaining operands; unit
      rows; spec requirements, design decision 12, `reference/commands.md`
      (ledger 1.20)
- [x] 10.20 Track commander's program-level `help [command]` as pending on
      `upstream-spellings` (not implemented): a `source: cli` `help` entry in
      `parity-pending.yaml` covering its `[command]` positional, both hidden
      reachability fixtures, `pending` precedence-matrix rows pinning cospec's
      current `unknown command` answer, design decisions 6 and the pending
      table; the docs pending list shows it (ledger 1.21)
- [x] 10.21 Make the binary the `--store-path` authority on every forward row:
      delete `cli.ts`'s `relayForwardStorePath` and every forward-row
      `--store-path` token scan, so a token that is another flag's value runs
      the command (`schema init s1 --description --store-path`, exit 0); the
      wrappers (`passthrough-command.ts`, `store`, `workset`, `config`) answer
      the binary's own `--store-path` refusal with cospec's redirect
      (`core/forward-relay.ts`), and their parse-rejection relay recognises the
      redirect shape; the terminal-handover leaves alone check the option
      position statically and never spawn; precedence-matrix rows, unit rows,
      design decision 2, the spec requirement, `docs/architecture.md` and
      `reference/commands.md` (ledger 1.22)
- [x] 10.22 Rank the table parser's refusals as commander's scan does:
      `parseSurface` records the first unknown option or pending flag and keeps
      scanning, so a trailing value-taking flag (`--store-path` included,
      answered with its redirect ahead of help) is refused first, then the
      recorded refusal, then too many arguments, then `--store-path`; unit and
      precedence-matrix rows (`status --help --bogus --change`,
      `list --bogus --store-path`, `list --help --bogus --store-path`,
      `list --sort x --store-path`); the `runCommand` docstring, design decision
      12, the spec requirement and `reference/commands.md` (ledger 1.23)
- [x] 10.23 Extend the close-out grep (ledger 7.6, task 9.2) to `test.failing`
      and a non-empty `KNOWN_FAILING`; the set ends empty
- [x] 10.24 Precedence-matrix rows for a dangling pending flag and for
      `--store-path`'s space-form value: `list --help --sort`,
      `list --bogus --sort`, `list -x --sort`, `validate --help --type`,
      `init --help --language`, `status --change c1 --help --schema`,
      `status --change c1 --bogus --schema`, `show c1 --store-path --help`,
      `schemas --store-path -h`, `--store-path --help list`,
      `list --store-path --store`, `list --store-path --cwd`,
      `show c1 --store-path --store`, `show c1 --store-path --store foo`,
      `show c1 --store-path --json`, `list --store-path --json`,
      `list --store-path=/x --json`; `same` rows also compare the number of JSON
      documents on stdout (`documentCount()` in `support/parse-class.ts`); rows
      failing at HEAD run as `test.failing` (ledger 1.24)
- [x] 10.25 A pending value-taking flag with no value is refused as argument
      missing (`parseSurface`), from its placeholder like a handled flag, so it
      outranks help and an earlier unknown option or pending flag;
      `init     --language`'s placeholder is the binary's `<language>`; unit
      rows (ledger 1.25)
- [ ] 10.26 Phase B keeps a space-form `--store-path` and its next token
      together, verbatim, so neither global absorption nor help interception
      takes the value; phase A needs no change (the program level does not
      declare `--store-path`, so help outranks it there); unit rows, the
      `runCommand` docstring (ledger 1.26)
