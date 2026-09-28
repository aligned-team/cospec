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
      `closest()` moved out of `cli.ts` into the table module; anything not in
      the table fails, except on forward commands, where the binary decides
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
      (since 10.27, right after the command path, ahead of every user token) and
      reads `--json` only before it (since 10.27, only cospec's own threaded
      `--json`); differential rows for `list`, `status`, `templates` and `show`;
      spec requirement and the global-flags note in `reference/commands.md`
      (ledger 1.10)
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
- [x] 10.26 Phase B keeps a space-form `--store-path` and its next token
      together, verbatim, so neither global absorption nor help interception
      takes the value; phase A needs no change (the program level does not
      declare `--store-path`, so help outranks it there); no cross-phase
      priority flag; unit rows, the `runCommand` docstring, a spec scenario,
      design decision 2, `docs/architecture.md` and `reference/commands.md`
      (ledger 1.26)
- [x] 10.27 Thread cospec's own flags (`--json`, `--no-color`, `--store <id>`)
      onto every wrapped call right after its command path, ahead of the user's
      argv (`threadedArgv` in `core/openspec.ts`; `passthroughOpenspec` takes
      the call as `{command, threaded, args}`), in every wrapper and spawn
      helper (`passthrough-command.ts`, `store`, `workset`, `config`, `context`,
      `doctor`, `complete`, `list --specs`, `new`, `validate`, `archive`, the
      typed `status`/`list`/`instructions` JSON calls), so a user's dangling
      value-taking flag stays dangling and the binary refuses it without
      writing; the one-JSON-document invariant keys on cospec's threaded
      `--json`, never a user token; wrapped-call labels and the remaining
      runtime messages in R1-owned files (`new`, `archive`, `validate`) name
      "the wrapped OpenSpec call" instead of a bare `openspec` command;
      precedence-matrix threading rows (each asserting nothing was written),
      unit rows, design decision 1, the forwarded-command spec requirement and
      `reference/commands.md` (ledger 1.27)
- [x] 10.28 Phase B keeps every space-form value-taking flag the row declares
      (or its subcommand declares, once the first positional names one) together
      with its next token, whatever it looks like (`takesNextToken` in
      `core/command-table.ts`, generalising 10.26's `--store-path` pair), so a
      help flag, a global or `--` there is the flag's value; it first takes out
      every `--no-color` before the first `--`, as upstream's program level
      does, and past a `--` taken as a value treats `--no-color` and `--version`
      as the command's own tokens; `store` strips its `--no-cospec-init` only in
      option position (not as `--path`'s value, not after `--`);
      `feedback --upstream` puts the message behind `--`; no cross-phase
      priority flag; precedence-matrix rows for every declared value-taking flag
      and the program-level tokens, unit rows, the `runCommand` docstring, a
      spec requirement with scenarios, design decision 12,
      `docs/architecture.md`, `reference/commands.md` and the BREAKING paragraph
      (proposal and the PR-body copy in
      `.claude/handoff/reports/unknown-option-contract-breaking.md`) (ledger
      1.28)
- [x] 10.29 Each `table` row declares `store: 'accepted' | 'refused'`; the rows
      whose module never resolves a root (`init`, `update`, `completion`,
      `feedback`, `check-commit`) keep a post-command `--store` in the argv for
      the table parser to refuse as an unknown option (never suggesting
      `--store` itself), refuse a program-level `--store` with the row's other
      parse refusals, and omit `--store` from their `--help` and from the
      globals bash, zsh and fish complete after the command name
      (`rowGlobalFlags`); a unit test derives the marking from each module's
      source; `new`'s store hint names `cospec init <store-path>`; matrix rows,
      design decision 10, a spec scenario, `reference/commands.md` and the
      BREAKING paragraph (ledger 1.29)
- [x] 10.30 `parse: 'forward'` is the marker the reachability test reads: a
      forward row's flags and positionals resolve by delegation to the binary, a
      separate check keeps their declarations complete at the pin and bars a
      pending surface on a forward row, and a negative case covers an undeclared
      forward flag; the differential asserts `show --bogus` and
      `show foo --bogus` relay the binary's streams exactly and that every
      forward row has a row; T1 wording (proposal, design decision 1, task 1.2)
      reads "anything not in the table fails, except on forward commands, where
      the binary decides"; `docs/architecture.md` (ledger 1.30)
- [x] 10.31 A forward wrapper's pre-spawn guard answers only what the binary
      would not: `config`'s lifted `--scope` with no value refuses in the
      decision-3 missing-value form; `show`'s item guard steps aside for an
      undeclared option (the binary's item), a dangling declared value flag or
      `--store-path` (`binaryAnswers`); matrix rows, a unit test, a spec
      scenario (ledger 1.31)
- [x] 10.32 An option where a forward row's subcommand belongs is relayed to the
      binary at the command's level (`relayCommandLevel` in
      `core/forward-relay.ts`, used by `config`, `schema` and `workset`), never
      refused as an unknown subcommand; `--store-path` takes the next token only
      on `table` rows and on forward rows whose upstream command declares it
      (`declaresStorePath`: `show`, `schemas`), so a help flag after it is
      cospec's help elsewhere; an option-like operand after a leading `--` keeps
      its `--` (`subcommandOf`), and `config` stops lifting `--scope` past a
      `--`; the matrix fails any relayed `Usage: openspec` help screen; matrix
      rows, unit rows, design decision 2, a spec scenario,
      `docs/architecture.md` (ledger 1.32)
- [x] 10.33 Issue #48: `cospec apply <slug>` names the slug in the canon gate
      prose (`relayApplyInstructions` fills `cospec apply "<change>"` with the
      resolved change id, in the JSON and the human transcript); the canon text
      keeps its placeholder; `mise run generate` no drift; unit and integration
      tests; own `fix(canon)` commit (ledger 1.33)
- [x] 10.34 `status --json` answers every path with one document: an unknown
      change and a missing `--change` with several active changes emit
      upstream's `{status: [{severity, code: 'change_error', message}]}`, exit
      1; no active changes emits `{changes: [], root, message}`, exit 0; matrix
      rows (the `status --change -- --json` row restored), a unit test,
      `reference/commands.md` (ledger 1.34)
- [x] 10.35 `new <type>` refuses a cospec type the repo has no schema for
      (`cospec new: schema '<type>' is not installed in this repo — run     'cospec init' first`),
      before the wrapped `new change` would fail on `Schema '<type>' not found`
      and cospec reported a wrapped-call failure; a matrix row, a unit test
      (ledger 1.35)
- [x] 10.36 Round-7 rows first: 37 precedence-matrix rows (35 at a517506, 2 at
      9e3ee95) ran as `test.failing` against the pre-fix source; the classifier
      gains commander's `missing required argument` kind; each fix commit
      removes its own keys and `KNOWN_FAILING` is empty at e09cc95
- [x] 10.37 `--store-path` takes a value only on a row marked
      `declaresStorePath` (upstream's `list`, `view`, `archive`, `validate`,
      `status`, `instructions`, `new`, `context`, `doctor`, `show`, `schemas`);
      elsewhere the table parser records it as a valueless unknown option in
      scan order, the forward relay and the handover check answer it as text
      under `--json`; design decision 2's "every table row" sentence rewritten;
      `reference/commands.md`, `docs/architecture.md` (ledger 1.36)
- [x] 10.38 `new`'s installed-schema check reads the user-level directory the
      binary reads (`$XDG_DATA_HOME/openspec/schemas`, else
      `~/.local/share/openspec/schemas`, `%LOCALAPPDATA%` on Windows), with its
      symlink guard, instead of `~/.config/openspec/schemas` (ledger 1.37)
- [x] 10.39 `isParseRejection` recognises every commander 14 parse-time refusal
      shape, `missing required argument` included; `feedback` with no message
      words it as commander does (ledger 1.38)
- [x] 10.40 `status`'s positional is `displacedBy` `--change` and `--all`:
      beside either it is too many arguments, as upstream; the dead
      positional-under-`--all` branch goes; `reference/commands.md` (ledger
      1.39)
- [x] 10.41 Short-option clusters split as commander splits them on table rows;
      a forward row keeps the cluster and answers only a split-out `-h` with
      cospec's help; any `-V…` cluster before `--` is the version;
      `reference/commands.md` (ledger 1.40)
- [x] 10.42 Round-8 rows first: 4 precedence-matrix rows (at 816a69b) and 14
      relayed-remedies contract tests (4 at 816a69b, 10 at b71c932) ran as
      `test.failing` against the pre-fix source; each fix commit flips its own
      and `KNOWN_FAILING` is empty at 22adc3e
- [x] 10.43 `templates` and `schema` carry `storeInArgv`: phase B leaves a
      post-command `--store <id>` in the argv where the user typed it, so the
      binary names an earlier unknown option or `--store-path` first (the
      377d09a regression) and a later flag's missing value still wins; a
      pre-command `--store` stays threaded ahead; design decision 1,
      `reference/commands.md`, `docs/architecture.md` (ledger 1.41)
- [x] 10.44 `relayRespelled`/`respellRemedies` in `core/forward-relay.ts` spell
      the binary's remedies through cospec on a failed relay: `show`'s
      `status --change` remedy and noun-form clause, the no-root
      `run openspec init` (`show`, `context`, `instructions`); `view`'s footer;
      `status --change` on a legacy schema relays the binary's status with its
      `Next:` line respelled, and `status --all` points at `cospec status`
      (ledger 1.42, 1.43)
- [x] 10.45 `new`'s missing-schema refusal answers `--json` with one
      `{change: null, status: [change_error]}` document (ledger 1.44)
- [x] 10.46 Bare-openspec sweep over every command's text and `--json` output on
      a fixture (success and each reachable error, with and without a registered
      store): every hit in an R1 file is fixed (10.43–10.45); hits in other
      changes' files are listed with their owner in ledger 1.45
- [x] 10.47 Round-9 rows first (c751a61): 7 precedence-matrix `new … --json`
      rows in `KNOWN_FAILING` and 5 `relayed-remedies.test.ts` show tests as
      `test.failing`, each failing for its intended reason (0 documents / the
      relayed "Nothing to show" screen); the fixes flip them and `KNOWN_FAILING`
      is empty at 4e4f55d
- [x] 10.48 `show`'s `binaryAnswers` skips an empty token (after `--` too) and
      the item-name refusal answers `--json` with one `{status: [missing_item]}`
      document; `reference/commands.md` (ledger 1.46)
- [x] 10.49 A pre-command `--store` on `templates`/`schema` is stated as
      threaded and refused by the binary (`unknown option '--store'`), never as
      selecting the root: `reference/commands.md`, the `storeInArgv` comment,
      design decision 1, `docs/architecture.md`; two matrix rows (ledger 1.47)
- [x] 10.50 The shared `cospec()` spawn helper takes `unset`, deleting keys
      after the environment merge; the no-`$XDG_DATA_HOME` row runs without the
      ambient value (ledger 1.48)
- [x] 10.51 Every own refusal of `new` answers `--json` with one
      `{change: null, status: [change_error]}` document; a missing slug and an
      unknown option stay text parse refusals; `reference/commands.md`, the
      spec, the proposal's BREAKING (ledger 1.49)
- [x] 10.51 Round-10 rows first (d76609a): 6 precedence-matrix `new` rows in
      `KNOWN_FAILING` (`new broken x` in both modes; `new`, `new --json`,
      `new feat`, `new feat --json` with no `openspec/`, keyed `[no root]` by
      the new `Row.variant`), each failing for its intended reason (the wrapped
      call's exit code / the root refusal); the fixes flip them and
      `KNOWN_FAILING` is empty at 5e477bb
- [x] 10.52 `new` runs the wrapped `new change` with `--json` and relays its
      reason (`wrappedNewReason`: `status[0].message`, else ANSI-stripped stderr
      minus `✖ Error:`, respelled through cospec) in both modes;
      `reference/commands.md` (ledger 1.50)
- [x] 10.53 `new`'s positional-count usage refusal runs before the root is
      resolved and before the `openspec/` check; `reference/commands.md` (ledger
      1.51)
- [x] 10.54 `cospecSchemaInstalled` takes `env`/`home` like `userSchemasDir`,
      and `new`'s `run` takes them as its second argument; the unit tests pass a
      sandboxed empty home instead of mutating `process.env` (ledger 1.52)
- [x] 10.55 Round-11 rows first (a19e116): 25 precedence-matrix rows in
      `KNOWN_FAILING` (the new `MISSING_ARGUMENT_ROWS` group plus the rewritten
      `new feat`/`new feat --json`/`[no root]` rows), 2 `wrappedNewReason` unit
      cases as `test.failing`; each fails for its intended reason; the set is
      empty at cbed5e5 and the unit cases plain `test` at 7474479
- [x] 10.56 The table parser refuses a required positional given nothing as
      `cospec <command>: missing required argument '<name>'` plus the usage,
      after unknown options and before too many arguments and `--store-path`, on
      every `table` row; `compound` marker on `new`'s `type`; `check-commit`'s
      file optional; archive/instructions divergence from upstream's optional
      positional commented on the rows; `reference/commands.md` (ledger 1.53)
- [x] 10.57 The modules' unreachable missing-argument branches removed (`new`'s
      usage refusal, `apply`/`archive`/`migrate`/`instructions`, `feedback`,
      `__complete`); their unit cases moved to the parser (ledger 1.53)
- [x] 10.58 `wrappedNewReason` respells only `RELAYED_REMEDIES` spans and
      `openspec <table command>`, leaving a schema load error's payload
      untouched; `reference/commands.md` (ledger 1.54)
- [x] 10.59 Round-12 rows first (8c21888, 89695a4): 3 `wrappedNewReason` unit
      cases as `test.failing` (prose stays, quoted paths and the
      `already exists     at` path stay, a warning line ahead of the document);
      each fails for its intended reason; plain `test` at b4e7394 and 7236f18
- [x] 10.60 `wrappedNewReason` respells `openspec <table command>` only after a
      remedy lead-in, masks single-quoted spans that open no remedy, cuts the
      path after `already exists at`, and parses the document after a warning
      line; spec requirement + scenario, `reference/commands.md` (ledger 1.55,
      1.56)
- [x] 10.61 Round-13 rows first (4519943): 2 unit cases as `test.failing`
      (`wrappedNewReason` and the relay: an apostrophe in a quoted path, an
      unquoted `Invalid store declaration in <path>` pointer path, a
      `(openspec list)` directory); each input fails for its intended reason;
      plain `test` at ca90823
- [x] 10.62 `core/remedies.ts`: one allowlist of the pinned dist's exact
      sentences naming `openspec <command>`, each with its cospec spelling;
      `respellReason`/`OPENSPEC_REMEDY`/`REMEDY_LEAD`/`SINGLE_QUOTED` (new.ts)
      and `RELAYED_REMEDIES` (forward-relay.ts) removed; `status`/`view`/`new`
      and `relayRespelled` read it; contract `remedy-enumeration.test.ts` over
      the dist with `support/remedy-sources.ts` (every line classified as an
      allowlist id or a never-relayed reason); unit `remedies.test.ts` (every
      entry respelled, text and JSON) (ledger 1.57)
- [x] 10.63 `apply`'s relay guard (`relayThroughCospec`) reads the same
      allowlist instead of its backtick-span rule (ledger 1.58)
- [x] 10.64 Spec requirement + scenario
      `Only upstream's own sentences are     respelled`, design decision 13,
      `reference/commands.md` (`new` row, the relayed-remedy paragraph),
      `concepts/apply-and-archive.md` (ledger 1.57, 1.58)
- [x] 10.65 Success-path rows first (9149694): 4 `relayed-remedies.test.ts` rows
      (`context`, `instructions proposal --change done`, each with and without
      `--json`, over a root referencing a usable, an unusable and an
      unregistered store) as `test.failing`, each failing on the bare
      `Fetch:`/`Fix:` lines; plain `test` at e9ef302
- [x] 10.66 `relayRespelled` takes `success: 'verbatim' | 'respell'`; `context`
      and `instructions` pass `'respell'`, `show` keeps the verbatim default;
      unit `relayRespelled` cases; spec requirement + scenario, design decisions
      1 and 13, `reference/commands.md`, `docs/architecture.md` (ledger 1.59)
- [x] 10.67 `.agents/shared.md` gains the "Relayed remedies come from one
      allowlist" discipline; `mise run agents:sync` (ledger 1.60)
- [x] 10.68 Round-14 `show` rows first (9ba58b1): unit `binaryAnswers` case and
      8 `relayed-remedies.test.ts` rows (`show -r1`, `-r=1`, `-rr`,
      `--no-scenarios -r1`, text and `--json`) as `test.failing`, each failing
      because cospec spawned the binary's "Nothing to show" screen; plain `test`
      at 52d0e53
- [x] 10.69 `binaryAnswers` splits short options with `splitShortCluster`
      (value-taking short takes the rest of its token; boolean short leaves
      `-<rest>` next; `-X=<v>` matches the short); `SHOW_EMPTY`'s never-relayed
      reason names the case (ledger 1.61)
- [x] 10.70 Round-14 success-path rows first (9da374f):
      `instructions proposal     --change done` (text and `--json`) with the
      sentence in a project schema template, `config.yaml` context and rules and
      a referenced spec's Purpose, and `context --json`/`instructions … --json`
      in a project dir named with the sentence, as `test.failing` (each failing
      on the rewritten user content or path); the `Run openspec init here` dir
      rows as plain `test`; plain `test` at c0c8cb8
- [x] 10.71 `respellReferenceRemedies` (core/remedies.ts): a successful
      `context`/`instructions` respells only a `Fetch:`/`Fix:` line or a
      `fetch`/`fix` JSON property whose whole value is one allowlisted remedy;
      `relayRespelled` takes `success: 'verbatim' | 'references'`, stderr on
      success verbatim; unit cases; spec requirement + scenarios, design
      decisions 1 and 13, `reference/commands.md`, `docs/architecture.md`
      (ledger 1.62)
- [x] 10.72 `.agents/shared.md`'s allowlist discipline names
      `respellReferenceRemedies` for a successful `context`/`instructions`;
      `mise run agents:sync` (ledger 1.62)
- [x] 10.73 Round-15 user-line rows first (cd0698c):
      `instructions proposal     --change done`, text and `--json`, with a
      template line `Fix: Run openspec init to create a root here.`, a context
      line `Fetch: openspec show <spec-id> --type spec --store st1`, a rule
      `  Fix: Pass a registered store id, or run openspec store list.`, a
      template line `  "fix": "Run: openspec store doctor st2"`, and a forged
      `<referenced_stores>` block in the context and in the template; the five
      text rows other than the rule's as `test.failing` (each came back
      respelled), the rule row and every `--json` row as plain `test`; plain
      `test` at b09c65e (ledger 1.63)
- [x] 10.74 `respellReferenceRemedies(text, answer, json)` locates the binary's
      own remedies by structure: `instructions`' `<referenced_stores>` element
      right after `</task>` and the project context, its entry lines after a
      `Store <store-id>` header; `context`'s `Referenced stores` and
      `Not available on this machine` sections; under `--json` the parsed
      document's `references[]`/`members[]`/`status[]` `fetch`/`fix` fields,
      re-encoded in place; round 14's `REFERENCE_LINE`/`REFERENCE_FIELD`
      removed; `relayRespelled` takes `'context' | 'instructions'`; unit cases
      (ledger 1.63)
- [x] 10.75 Spec requirement + scenario, design decisions 1 and 13 (the round-14
      residual closed), `reference/commands.md`, `docs/architecture.md`,
      `.agents/shared.md` + `mise run agents:sync` (ledger 1.63)
- [x] 10.76 Round-15 layout rows first (94a1ffc, bd979d1): contract
      `instructions archive --change done` (text and `--json`) with a context
      forging `</task>` and a block (text `test.failing`: respelled by b09c65e's
      first-`</task>` anchor); unit cases for a leading stat warning under
      `--json`, a `--json` answer with no document, and an archive-shaped answer
      (`test.failing`), no references with a forged template block and a blocked
      artifact's warning (plain `test`); plain `test` at 77608e3
- [x] 10.77 `instructionsBlock` walks `printInstructionsText`'s layout from the
      `<artifact` line (warning, task, project context); `--json` starts at the
      first `{` line and a document-less answer fails naming the wrapped call;
      design 13, spec scenario, `docs/architecture.md` (ledger 1.63)
